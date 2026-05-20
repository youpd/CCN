const fs = require('fs');
const path = require('path');
const os = require('os');

// Codex CLI는 ~/.codex/config.toml의 top-level `notify` 키로 외부 명령을 호출.
// 우리는 라인 끝에 `# ccn-managed` sentinel을 박아 idempotent + 안전한 제거를 보장.
// TOML 파서를 끌어오지 않는 이유: notify는 한 줄 array of strings이라 라인 기반으로 충분.

const SENTINEL = '# ccn-managed';
const NOTIFY_RE = /^\s*notify\s*=/;

function tomlBasic(s) {
    // TOML basic string: 백슬래시/따옴표 이스케이프
    return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function desiredLine(scriptPath, notifyFile) {
    return `notify = ["node", ${tomlBasic(scriptPath)}, "task_complete", ${tomlBasic(notifyFile)}] ${SENTINEL}`;
}

function isManaged(line)    { return NOTIFY_RE.test(line) && line.includes(SENTINEL); }
function isUserNotify(line) { return NOTIFY_RE.test(line) && !line.includes(SENTINEL); }

function readLines(p) {
    if (!fs.existsSync(p)) return [];
    return fs.readFileSync(p, 'utf8').split(/\r?\n/);
}
function writeLines(p, lines) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, lines.join('\n'));
}
function findIdx(lines, pred) {
    for (let i = 0; i < lines.length; i++) if (pred(lines[i])) return i;
    return -1;
}

function install({ scriptSrc, scriptDest, notifyFile, configPath }) {
    // 1) 스크립트 배치 (기존 동작 유지)
    fs.mkdirSync(path.dirname(scriptDest), { recursive: true });
    fs.copyFileSync(scriptSrc, scriptDest);

    const cfgPath = configPath || path.join(os.homedir(), '.codex', 'config.toml');
    const lines = readLines(cfgPath);
    const desired = desiredLine(scriptDest, notifyFile);

    // 2) 우리가 박은 라인 있는지 확인
    const managedIdx = findIdx(lines, isManaged);
    if (managedIdx !== -1) {
        if (lines[managedIdx] === desired) {
            return { status: 'unchanged', method: 'config.toml-managed', scriptDest, configPath: cfgPath };
        }
        lines[managedIdx] = desired;
        writeLines(cfgPath, lines);
        return { status: 'updated', method: 'config.toml-managed', scriptDest, configPath: cfgPath };
    }

    // 3) 사용자가 직접 박은 notify 있으면 건드리지 않음
    const userIdx = findIdx(lines, isUserNotify);
    if (userIdx !== -1) {
        return {
            status: 'skipped-user-notify',
            method: 'script-only',
            scriptDest,
            configPath: cfgPath,
            hint: '~/.codex/config.toml에 이미 사용자 notify가 설정돼 있어 자동 추가를 건너뛰었습니다. 수동으로 변경하거나 그 줄을 지운 뒤 다시 시도하세요.'
        };
    }

    // 4) 맨 앞에 박기. 빈 줄로 다음 키와 분리해서 [table] 헤더로 빨려 들어가는 사고 방지.
    if (lines.length === 0 || lines[0].trim() === '') {
        lines.unshift(desired);
    } else {
        lines.unshift(desired, '');
    }
    writeLines(cfgPath, lines);
    return { status: 'installed', method: 'config.toml-managed', scriptDest, configPath: cfgPath };
}

function uninstall({ configPath }) {
    const cfgPath = configPath || path.join(os.homedir(), '.codex', 'config.toml');
    if (!fs.existsSync(cfgPath)) return { removed: 0, configPath: cfgPath };

    const lines = readLines(cfgPath);
    const idx = findIdx(lines, isManaged);
    if (idx === -1) return { removed: 0, configPath: cfgPath };

    // 맨 앞에 박을 때 우리가 같이 넣은 분리 빈 줄을 함께 제거 (idx==0인 케이스 한정)
    const followIsBlank = idx + 1 < lines.length && lines[idx + 1].trim() === '';
    const removeCount = (idx === 0 && followIsBlank) ? 2 : 1;
    lines.splice(idx, removeCount);
    writeLines(cfgPath, lines);
    return { removed: 1, configPath: cfgPath };
}

module.exports = { install, uninstall, SENTINEL, desiredLine, isManaged, isUserNotify };
