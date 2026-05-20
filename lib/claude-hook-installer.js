const fs = require('fs');
const path = require('path');

const SENTINEL = '# ccn-managed';

// 항상 박히는 기본 hook들.
const HOOK_SECTIONS = [
    { section: 'Notification', matcher: 'permission_prompt|elicitation_dialog' },
    { section: 'Stop',         matcher: undefined },
    { section: 'SubagentStop', matcher: undefined }
];

function isManaged(entry) {
    return entry && Array.isArray(entry.hooks) &&
        entry.hooks.some(h => typeof h.command === 'string' && h.command.includes(SENTINEL));
}

function readSettings(p) {
    try {
        const raw = fs.readFileSync(p, 'utf8').trim();
        if (!raw) return {};
        return JSON.parse(raw);
    } catch (_) {
        return {};
    }
}

function writeSettings(p, settings) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(settings, null, 2) + '\n');
}

function commandFor(scriptPath, sectionName, notifyFile) {
    return `node "${scriptPath}" "${sectionName}" "${notifyFile}" ${SENTINEL}`;
}

// options.notifyOnDangerousTool: PreToolUse hook을 함께 박을지 (default false)
// options.dangerousToolMatcher: PreToolUse matcher (e.g. "Bash|Write|Edit")
function buildSettings(settings, scriptPath, notifyFile, options) {
    const opt = options || {};
    const result = JSON.parse(JSON.stringify(settings));
    if (!result.hooks) result.hooks = {};
    let changed = false;

    const sections = HOOK_SECTIONS.slice();
    if (opt.notifyOnDangerousTool) {
        sections.push({
            section: 'PreToolUse',
            matcher: opt.dangerousToolMatcher || 'Bash|Write|Edit'
        });
    }

    for (const { section, matcher } of sections) {
        if (!result.hooks[section]) result.hooks[section] = [];

        const idx = result.hooks[section].findIndex(isManaged);
        const desired = {
            hooks: [{ type: 'command', command: commandFor(scriptPath, section, notifyFile) }]
        };
        if (matcher) desired.matcher = matcher;

        if (idx === -1) {
            result.hooks[section].push(desired);
            changed = true;
        } else {
            const cur = result.hooks[section][idx];
            const matcherChanged = (cur.matcher || undefined) !== matcher;
            const cmdChanged = !cur.hooks || !cur.hooks[0] || cur.hooks[0].command !== desired.hooks[0].command;
            if (matcherChanged || cmdChanged) {
                result.hooks[section][idx] = desired;
                changed = true;
            }
        }
    }

    // 옵션 꺼졌는데 managed PreToolUse가 박혀있으면 제거 (다른 sentinel은 보존)
    if (!opt.notifyOnDangerousTool && Array.isArray(result.hooks.PreToolUse)) {
        const before = result.hooks.PreToolUse.length;
        result.hooks.PreToolUse = result.hooks.PreToolUse.filter(e => !isManaged(e));
        if (result.hooks.PreToolUse.length < before) changed = true;
        if (result.hooks.PreToolUse.length === 0) {
            delete result.hooks.PreToolUse;
        }
    }

    return { settings: result, changed };
}

function removeManaged(settings) {
    const result = JSON.parse(JSON.stringify(settings));
    if (!result.hooks) return { settings: result, removed: 0 };
    let removed = 0;
    for (const section of Object.keys(result.hooks)) {
        if (!Array.isArray(result.hooks[section])) continue;
        const before = result.hooks[section].length;
        result.hooks[section] = result.hooks[section].filter(e => !isManaged(e));
        removed += before - result.hooks[section].length;
        if (result.hooks[section].length === 0) delete result.hooks[section];
    }
    if (Object.keys(result.hooks).length === 0) delete result.hooks;
    return { settings: result, removed };
}

function install({ settingsPath, scriptSrc, scriptDest, notifyFile, options }) {
    fs.mkdirSync(path.dirname(scriptDest), { recursive: true });
    fs.copyFileSync(scriptSrc, scriptDest);

    const settings = readSettings(settingsPath);
    const { settings: next, changed } = buildSettings(settings, scriptDest, notifyFile, options);
    if (changed) writeSettings(settingsPath, next);
    return { changed, scriptDest, settingsPath };
}

function uninstall({ settingsPath }) {
    const settings = readSettings(settingsPath);
    const { settings: next, removed } = removeManaged(settings);
    if (removed > 0) writeSettings(settingsPath, next);
    return { removed };
}

module.exports = { install, uninstall, isManaged, buildSettings, removeManaged, SENTINEL, HOOK_SECTIONS };
