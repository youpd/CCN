const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { parsePayload, isAllowedEvent } = require('./lib/payload');
const claudeInstaller = require('./lib/claude-hook-installer');
const codexInstaller = require('./lib/codex-hook-installer');
const { sendSystemNotification } = require('./lib/system-notification');
const { sendTelegram } = require('./lib/webhook');
const { HistoryStore, HistoryTreeProvider } = require('./lib/history');

const NOTIFY_FILE = path.join(os.tmpdir(), `ccn-notify-${process.platform === 'win32' ? (process.env.USERNAME || 'user') : (process.env.USER || 'user')}`);
const CLAUDE_SCRIPT_DEST = path.join(os.homedir(), '.claude', 'ccn-notify.js');
const CODEX_SCRIPT_DEST = path.join(os.homedir(), '.codex', 'ccn-notify.js');

let output;
let fileWatcher = null;
let isHandling = false;
let lastNotifKey = '';
let lastNotifTime = 0;
const DEDUP_MS = 2000;

let history;
let historyView;
let statusItem;

function log(msg) {
    if (!output) return;
    const ts = new Date().toISOString();
    output.appendLine(`[${ts}] ${msg}`);
}

function activate(context) {
    output = vscode.window.createOutputChannel('CCN');
    log('CCN activating');
    context.subscriptions.push(output);

    history = new HistoryStore(context.globalState, getCfg().get('history.maxItems', 200));
    historyView = new HistoryTreeProvider(history);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('ccn.history', historyView)
    );

    statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusItem.command = 'ccn.history.muteToggle';
    refreshStatus();
    statusItem.show();
    context.subscriptions.push(statusItem);

    // Hook installation (best-effort)
    const reinstallClaude = () => claudeInstaller.install({
        settingsPath: path.join(os.homedir(), '.claude', 'settings.json'),
        scriptSrc: path.join(context.extensionPath, 'hooks', 'claude-notify.js'),
        scriptDest: CLAUDE_SCRIPT_DEST,
        notifyFile: NOTIFY_FILE,
        options: {
            notifyOnDangerousTool: getCfg().get('claude.notifyOnDangerousTool', false),
            dangerousToolMatcher: getCfg().get('claude.dangerousToolMatcher', 'Bash|Write|Edit')
        }
    });

    try {
        const r = reinstallClaude();
        log(`Claude hooks installed: ${JSON.stringify(r)}`);
    } catch (err) {
        log(`Claude hook install failed: ${err.stack || err.message}`);
        vscode.window.showWarningMessage(
            `CCN: Claude hook 설치 실패 — ${err.message}. "CCN: Install Claude Code Hooks" 커맨드로 재시도하세요.`
        );
    }

    try {
        const r = codexInstaller.install({
            scriptSrc: path.join(context.extensionPath, 'hooks', 'codex-notify.js'),
            scriptDest: CODEX_SCRIPT_DEST,
            notifyFile: NOTIFY_FILE
        });
        log(`Codex hook setup: ${JSON.stringify(r)}`);
        if (r.status === 'skipped-user-notify') {
            vscode.window.showWarningMessage(`CCN: ${r.hint}`);
        }
    } catch (err) {
        log(`Codex hook setup failed (non-fatal): ${err.message}`);
    }

    // Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('ccn.test', () => writeTestPayload()),
        vscode.commands.registerCommand('ccn.installClaudeHooks', () => {
            try {
                const r = reinstallClaude();
                vscode.window.showInformationMessage(`CCN: Claude hooks 설치 완료 (changed=${r.changed})`);
            } catch (e) {
                vscode.window.showErrorMessage(`CCN: 설치 실패 — ${e.message}`);
            }
        }),
        vscode.commands.registerCommand('ccn.uninstallClaudeHooks', () => {
            try {
                const r = claudeInstaller.uninstall({
                    settingsPath: path.join(os.homedir(), '.claude', 'settings.json')
                });
                vscode.window.showInformationMessage(`CCN: Claude hooks 제거 완료 (removed=${r.removed})`);
            } catch (e) {
                vscode.window.showErrorMessage(`CCN: 제거 실패 — ${e.message}`);
            }
        }),
        vscode.commands.registerCommand('ccn.installCodexHook', () => {
            try {
                const r = codexInstaller.install({
                    scriptSrc: path.join(context.extensionPath, 'hooks', 'codex-notify.js'),
                    scriptDest: CODEX_SCRIPT_DEST,
                    notifyFile: NOTIFY_FILE
                });
                const msg = {
                    'installed':           `CCN: Codex notify 설정 추가됨 (${r.configPath})`,
                    'updated':             `CCN: Codex notify 설정 갱신됨 (${r.configPath})`,
                    'unchanged':           `CCN: Codex notify 이미 설치됨 (변경 없음)`,
                    'skipped-user-notify': `CCN: ${r.hint}`
                }[r.status] || `CCN: Codex 통합 — ${r.status}`;
                if (r.status === 'skipped-user-notify') vscode.window.showWarningMessage(msg);
                else vscode.window.showInformationMessage(msg);
            } catch (e) {
                vscode.window.showErrorMessage(`CCN: Codex 설치 실패 — ${e.message}`);
            }
        }),
        vscode.commands.registerCommand('ccn.uninstallCodexHook', () => {
            try {
                const r = codexInstaller.uninstall({});
                vscode.window.showInformationMessage(
                    `CCN: Codex notify 제거 완료 (removed=${r.removed})`
                );
            } catch (e) {
                vscode.window.showErrorMessage(`CCN: Codex 제거 실패 — ${e.message}`);
            }
        }),
        vscode.commands.registerCommand('ccn.history.refresh', () => historyView.refresh()),
        vscode.commands.registerCommand('ccn.history.clear', async () => {
            const ok = await vscode.window.showWarningMessage(
                '알림 히스토리를 모두 삭제할까요?', { modal: false }, '삭제'
            );
            if (ok === '삭제') {
                history.clear();
                historyView.refresh();
            }
        }),
        vscode.commands.registerCommand('ccn.history.muteToggle', async () => {
            const cfg = getCfg();
            const next = !cfg.get('mute', false);
            await cfg.update('mute', next, vscode.ConfigurationTarget.Global);
            refreshStatus();
            vscode.window.setStatusBarMessage(
                next ? 'CCN: 알림 음소거됨' : 'CCN: 알림 활성화됨',
                2000
            );
        }),
        vscode.commands.registerCommand('ccn.showOutput', () => output.show()),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('ccn.mute')) refreshStatus();
            if (e.affectsConfiguration('ccn.history.maxItems')) {
                history.setMax(getCfg().get('history.maxItems', 200));
            }
            if (e.affectsConfiguration('ccn.claude.notifyOnDangerousTool') ||
                e.affectsConfiguration('ccn.claude.dangerousToolMatcher')) {
                try {
                    const r = reinstallClaude();
                    log(`PreToolUse hook reconfigured: changed=${r.changed}`);
                    if (r.changed) {
                        vscode.window.setStatusBarMessage(
                            `CCN: 위험 도구 알림 ${getCfg().get('claude.notifyOnDangerousTool', false) ? '활성' : '비활성'}됨`,
                            3000
                        );
                    }
                } catch (err) {
                    log(`PreToolUse reconfigure failed: ${err.message}`);
                }
            }
        })
    );

    startFileWatcher();
    context.subscriptions.push({ dispose: () => stopFileWatcher() });

    log(`CCN active. NOTIFY_FILE=${NOTIFY_FILE}`);
}

function deactivate() {
    stopFileWatcher();
}

function getCfg() {
    return vscode.workspace.getConfiguration('ccn');
}

function refreshStatus() {
    const muted = getCfg().get('mute', false);
    statusItem.text = muted ? '$(bell-slash) CCN' : '$(bell) CCN';
    statusItem.tooltip = muted ? 'CCN: 음소거 (클릭으로 해제)' : 'CCN: 활성 (클릭으로 음소거)';
}

function startFileWatcher() {
    try {
        if (!fs.existsSync(NOTIFY_FILE)) {
            fs.writeFileSync(NOTIFY_FILE, '', 'utf8');
        }
    } catch (err) {
        log(`failed to create notify file: ${err.message}`);
    }

    try {
        fileWatcher = fs.watch(NOTIFY_FILE, (eventType) => {
            if (eventType === 'change') handleNotification();
        });
        log(`watching ${NOTIFY_FILE}`);
    } catch (err) {
        log(`fs.watch failed, fallback to watchFile: ${err.message}`);
        fs.watchFile(NOTIFY_FILE, { interval: 500 }, (curr, prev) => {
            if (curr.mtimeMs > prev.mtimeMs) handleNotification();
        });
    }
}

function stopFileWatcher() {
    if (fileWatcher) {
        try { fileWatcher.close(); } catch (_) {}
        fileWatcher = null;
    }
    try { fs.unwatchFile(NOTIFY_FILE); } catch (_) {}
}

function writeTestPayload() {
    const payload = JSON.stringify({
        source: 'test',
        event: 'task_complete',
        text: 'CCN 테스트 알림입니다',
        ts: Date.now()
    });
    try {
        fs.writeFileSync(NOTIFY_FILE, payload, 'utf8');
    } catch (e) {
        vscode.window.showErrorMessage('CCN: 테스트 실패 — ' + e.message);
    }
}

function eventEnabledByConfig(source, event) {
    const cfg = getCfg();
    if (cfg.get('mute', false)) return false;
    if (source === 'claude') {
        if (event === 'permission_prompt') return cfg.get('claude.notifyOnPermissionRequest', true);
        if (event === 'elicitation_dialog' || event === 'question') return cfg.get('claude.notifyOnQuestion', true);
        if (event === 'task_complete' || event === 'idle_prompt' || event === 'stop') return cfg.get('claude.notifyOnTaskComplete', true);
        if (event === 'subagent_stop') return cfg.get('claude.notifyOnSubagentStop', false);
        if (event === 'dangerous_tool') return cfg.get('claude.notifyOnDangerousTool', false);
        return true;
    }
    if (source === 'codex') {
        if (event === 'task_complete') return cfg.get('codex.notifyOnTaskComplete', true);
        return true;
    }
    return true;
}

function isDuplicate(source, event, text) {
    const key = `${source}:${event}:${text}`;
    const now = Date.now();
    if (key === lastNotifKey && now - lastNotifTime < DEDUP_MS) return true;
    lastNotifKey = key;
    lastNotifTime = now;
    return false;
}

function handleNotification() {
    if (isHandling) return;
    isHandling = true;
    try {
        if (!fs.existsSync(NOTIFY_FILE)) return;
        const raw = fs.readFileSync(NOTIFY_FILE, 'utf8').trim();
        if (!raw) return;

        const payload = parsePayload(raw);
        const { source, event, text } = payload;

        if (!eventEnabledByConfig(source, event)) {
            log(`skip (disabled): ${source}/${event}`);
            return;
        }
        if (isDuplicate(source, event, text)) {
            log(`skip (dup): ${source}/${event}`);
            return;
        }

        const cfg = getCfg();
        const focused = vscode.window.state.focused;
        const suppressSys = cfg.get('suppressWhenFocused', false) && focused;

        const item = {
            ts: Date.now(),
            source, event, text
        };
        history.push(item);
        historyView.refresh();

        const delayMs = cfg.get('notificationDelayMs', 0) || 0;
        let sysTimer = null;
        const fireSys = () => {
            sendSystemNotification(`${labelSource(source)}: ${text}`, {
                notification: cfg.get('systemNotification', true) && !suppressSys,
                sound: cfg.get('sound', true) && !suppressSys
            });
        };
        if (delayMs > 0) sysTimer = setTimeout(fireSys, delayMs);
        else fireSys();

        const sevFn = severityFn(event);
        sevFn(`🔔 ${labelSource(source)} — ${text}`, 'OK').then((sel) => {
            if (sel === 'OK' && sysTimer) clearTimeout(sysTimer);
            try { fs.writeFileSync(NOTIFY_FILE, '', 'utf8'); } catch (_) {}
        });

        // External webhook (Telegram)
        const tgToken = cfg.get('webhook.telegram.botToken', '');
        const tgChat = cfg.get('webhook.telegram.chatId', '');
        const tgOnlyUnfocused = cfg.get('webhook.telegram.onlyWhenUnfocused', true);
        if (tgToken && tgChat && (!tgOnlyUnfocused || !focused)) {
            sendTelegram(tgToken, tgChat, `[${labelSource(source)}] ${text}`)
                .then(() => log('telegram sent'))
                .catch((e) => log(`telegram failed: ${e.message}`));
        }

        log(`notify: ${source}/${event} :: ${text}`);
    } catch (err) {
        log(`handleNotification error: ${err.stack || err.message}`);
    } finally {
        isHandling = false;
    }
}

function labelSource(s) {
    if (s === 'claude') return 'Claude Code';
    if (s === 'codex') return 'Codex';
    if (s === 'test') return 'CCN Test';
    return s || 'Agent';
}

function severityFn(event) {
    if (event === 'permission_prompt' || event === 'elicitation_dialog' || event === 'question' || event === 'dangerous_tool') {
        return vscode.window.showWarningMessage.bind(vscode.window);
    }
    if (event === 'error') {
        return vscode.window.showErrorMessage.bind(vscode.window);
    }
    return vscode.window.showInformationMessage.bind(vscode.window);
}

module.exports = { activate, deactivate };
