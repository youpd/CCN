// 가벼운 스모크 테스트. node test/run.js 로 실행.
// VSCode runtime 의존이 없는 모듈만 검증.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { parsePayload, isAllowedEvent } = require('../lib/payload');
const claudeInstaller = require('../lib/claude-hook-installer');
const codexInstaller = require('../lib/codex-hook-installer');

// 격리된 임시 디렉토리 (테스트마다 새로 만듦)
function tmpdir() {
    const d = path.join(os.tmpdir(), `ccn-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
    fs.mkdirSync(d, { recursive: true });
    return d;
}

let failed = 0;
function ok(name, fn) {
    try { fn(); console.log(`ok ${name}`); }
    catch (e) { failed++; console.error(`fail ${name}: ${e.message}`); }
}

ok('parsePayload accepts json', () => {
    const r = parsePayload('{"source":"claude","event":"task_complete","text":"hi"}');
    assert.strictEqual(r.source, 'claude');
    assert.strictEqual(r.event, 'task_complete');
    assert.strictEqual(r.text, 'hi');
});

ok('parsePayload falls back on plain text', () => {
    const r = parsePayload('hello');
    assert.strictEqual(r.source, 'agent');
    assert.strictEqual(r.event, 'notification');
    assert.strictEqual(r.text, 'hello');
});

ok('parsePayload empty -> notification', () => {
    const r = parsePayload('');
    assert.strictEqual(r.event, 'notification');
});

ok('isAllowedEvent default', () => {
    assert.strictEqual(isAllowedEvent('task_complete'), true);
    assert.strictEqual(isAllowedEvent('something_else'), false);
});

ok('claude buildSettings adds 3 sections idempotently', () => {
    const { settings: s1, changed: c1 } = claudeInstaller.buildSettings({}, '/x/script.js', '/tmp/n');
    assert.strictEqual(c1, true);
    assert.ok(s1.hooks.Notification);
    assert.ok(s1.hooks.Stop);
    assert.ok(s1.hooks.SubagentStop);
    assert.strictEqual(s1.hooks.Notification[0].matcher, 'permission_prompt|elicitation_dialog');
    assert.ok(s1.hooks.Notification[0].hooks[0].command.includes('ccn-managed'));

    const { changed: c2 } = claudeInstaller.buildSettings(s1, '/x/script.js', '/tmp/n');
    assert.strictEqual(c2, false, 'second run should be no-op');
});

ok('claude removeManaged preserves user hooks', () => {
    const userHook = { matcher: 'something', hooks: [{ type: 'command', command: 'echo hi' }] };
    const { settings: s1 } = claudeInstaller.buildSettings(
        { hooks: { Notification: [userHook] } },
        '/x/script.js', '/tmp/n'
    );
    assert.strictEqual(s1.hooks.Notification.length, 2);

    const { settings: s2, removed } = claudeInstaller.removeManaged(s1);
    assert.strictEqual(removed, 3, 'removes 3 managed entries (one per section)');
    assert.strictEqual(s2.hooks.Notification.length, 1);
    assert.deepStrictEqual(s2.hooks.Notification[0], userHook);
});

ok('claude buildSettings detects matcher drift', () => {
    const { settings: s1 } = claudeInstaller.buildSettings({}, '/x/script.js', '/tmp/n');
    // 사용자가 손으로 matcher를 바꿨다고 가정
    s1.hooks.Notification[0].matcher = 'old_matcher';
    const { changed } = claudeInstaller.buildSettings(s1, '/x/script.js', '/tmp/n');
    assert.strictEqual(changed, true);
});

ok('claude PreToolUse opt-in adds 4th section', () => {
    const { settings, changed } = claudeInstaller.buildSettings({}, '/x/s.js', '/tmp/n', {
        notifyOnDangerousTool: true,
        dangerousToolMatcher: 'Bash|Write'
    });
    assert.strictEqual(changed, true);
    assert.ok(settings.hooks.PreToolUse, 'PreToolUse section present');
    assert.strictEqual(settings.hooks.PreToolUse[0].matcher, 'Bash|Write');
    assert.ok(settings.hooks.PreToolUse[0].hooks[0].command.includes('ccn-managed'));
});

ok('claude PreToolUse opt-out removes managed PreToolUse but keeps user hooks', () => {
    // 1) 옵션 켜서 설치
    const userPre = { matcher: 'Custom', hooks: [{ type: 'command', command: 'echo user' }] };
    const seeded = { hooks: { PreToolUse: [userPre] } };
    const { settings: s1 } = claudeInstaller.buildSettings(seeded, '/x/s.js', '/tmp/n', {
        notifyOnDangerousTool: true
    });
    assert.strictEqual(s1.hooks.PreToolUse.length, 2);

    // 2) 옵션 꺼서 재설치
    const { settings: s2, changed } = claudeInstaller.buildSettings(s1, '/x/s.js', '/tmp/n', {
        notifyOnDangerousTool: false
    });
    assert.strictEqual(changed, true);
    assert.strictEqual(s2.hooks.PreToolUse.length, 1, 'only user hook remains');
    assert.deepStrictEqual(s2.hooks.PreToolUse[0], userPre);
});

ok('claude PreToolUse opt-out on empty array deletes section', () => {
    const { settings: s1 } = claudeInstaller.buildSettings({}, '/x/s.js', '/tmp/n', {
        notifyOnDangerousTool: true
    });
    assert.ok(s1.hooks.PreToolUse);
    const { settings: s2 } = claudeInstaller.buildSettings(s1, '/x/s.js', '/tmp/n', {
        notifyOnDangerousTool: false
    });
    assert.strictEqual(s2.hooks.PreToolUse, undefined, 'section removed when empty');
});

ok('claude PreToolUse matcher change triggers update', () => {
    const { settings: s1 } = claudeInstaller.buildSettings({}, '/x/s.js', '/tmp/n', {
        notifyOnDangerousTool: true,
        dangerousToolMatcher: 'Bash'
    });
    const { settings: s2, changed } = claudeInstaller.buildSettings(s1, '/x/s.js', '/tmp/n', {
        notifyOnDangerousTool: true,
        dangerousToolMatcher: 'Bash|Write|Edit'
    });
    assert.strictEqual(changed, true);
    assert.strictEqual(s2.hooks.PreToolUse[0].matcher, 'Bash|Write|Edit');
    assert.strictEqual(s2.hooks.PreToolUse.length, 1, 'still one managed entry');
});

// ---------- codex installer ----------
function setupCodex() {
    const d = tmpdir();
    const cfg = path.join(d, 'config.toml');
    const scriptSrc = path.join(d, 'src-notify.js');
    const scriptDest = path.join(d, 'dest-notify.js');
    fs.writeFileSync(scriptSrc, '// stub');
    return { d, cfg, scriptSrc, scriptDest, nf: path.join(d, 'notify-file') };
}

ok('codex install on empty -> installed', () => {
    const { cfg, scriptSrc, scriptDest, nf } = setupCodex();
    const r = codexInstaller.install({ scriptSrc, scriptDest, notifyFile: nf, configPath: cfg });
    assert.strictEqual(r.status, 'installed');
    const content = fs.readFileSync(cfg, 'utf8');
    assert.ok(content.includes('# ccn-managed'), 'sentinel present');
    assert.ok(content.includes('"node"'), 'node in array');
    assert.ok(fs.existsSync(scriptDest), 'script copied');
});

ok('codex install is idempotent', () => {
    const { cfg, scriptSrc, scriptDest, nf } = setupCodex();
    codexInstaller.install({ scriptSrc, scriptDest, notifyFile: nf, configPath: cfg });
    const r2 = codexInstaller.install({ scriptSrc, scriptDest, notifyFile: nf, configPath: cfg });
    assert.strictEqual(r2.status, 'unchanged');
});

ok('codex install skips when user notify already present', () => {
    const { cfg, scriptSrc, scriptDest, nf } = setupCodex();
    fs.writeFileSync(cfg, 'notify = ["my", "own", "notify"]\nmodel = "x"\n');
    const r = codexInstaller.install({ scriptSrc, scriptDest, notifyFile: nf, configPath: cfg });
    assert.strictEqual(r.status, 'skipped-user-notify');
    assert.ok(r.hint && r.hint.length > 0);
    // 사용자 라인 그대로 보존
    const content = fs.readFileSync(cfg, 'utf8');
    assert.ok(content.includes('"my", "own", "notify"'));
    assert.ok(!content.includes('# ccn-managed'));
});

ok('codex install preserves existing keys', () => {
    const { cfg, scriptSrc, scriptDest, nf } = setupCodex();
    const original = 'model = "gpt-5.5"\n\n[windows]\nsandbox = "elevated"\n';
    fs.writeFileSync(cfg, original);
    codexInstaller.install({ scriptSrc, scriptDest, notifyFile: nf, configPath: cfg });
    const content = fs.readFileSync(cfg, 'utf8');
    assert.ok(content.includes('model = "gpt-5.5"'), 'model preserved');
    assert.ok(content.includes('[windows]'), 'table preserved');
    // notify가 [windows] 헤더 위에 있어야 함 (그렇지 않으면 [windows.notify]가 됨)
    const notifyAt = content.indexOf('notify =');
    const tableAt  = content.indexOf('[windows]');
    assert.ok(notifyAt < tableAt, 'notify must precede [windows] table');
});

ok('codex install detects desired-line drift', () => {
    const { cfg, scriptSrc, scriptDest, nf } = setupCodex();
    codexInstaller.install({ scriptSrc, scriptDest, notifyFile: nf, configPath: cfg });
    // 다른 notifyFile로 다시 호출 -> 업데이트돼야 함
    const r2 = codexInstaller.install({ scriptSrc, scriptDest, notifyFile: nf + '-new', configPath: cfg });
    assert.strictEqual(r2.status, 'updated');
    const content = fs.readFileSync(cfg, 'utf8');
    assert.ok(content.includes('notify-file-new'));
    // 한 줄만 남아 있어야 함
    const count = (content.match(/^\s*notify\s*=/gm) || []).length;
    assert.strictEqual(count, 1);
});

ok('codex uninstall removes managed line and user lines stay', () => {
    const { cfg, scriptSrc, scriptDest, nf } = setupCodex();
    fs.writeFileSync(cfg, 'model = "x"\n');
    codexInstaller.install({ scriptSrc, scriptDest, notifyFile: nf, configPath: cfg });
    const r = codexInstaller.uninstall({ configPath: cfg });
    assert.strictEqual(r.removed, 1);
    const content = fs.readFileSync(cfg, 'utf8');
    assert.ok(!content.includes('# ccn-managed'));
    assert.ok(content.includes('model = "x"'));
});

ok('codex desiredLine escapes backslashes (Windows paths)', () => {
    const line = codexInstaller.desiredLine('C:\\Users\\x\\notify.js', 'C:\\tmp\\f');
    // TOML basic string에서 단일 백슬래시는 잘못된 이스케이프 -> 반드시 이중
    assert.ok(line.includes('"C:\\\\Users\\\\x\\\\notify.js"'), 'script path escaped');
    assert.ok(line.includes('"C:\\\\tmp\\\\f"'), 'notify file escaped');
});

if (failed > 0) {
    console.error(`${failed} test(s) failed`);
    process.exit(1);
}
console.log('all tests passed');
