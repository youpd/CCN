#!/usr/bin/env node
// Codex CLI의 notify 명령으로 호출되는 스크립트.
// 호출 패턴 (Codex 0.x):
//   node ccn-notify.js <default_event> <notify_file> <JSON_payload_or_text...>
// Codex는 보통 argv 끝에 JSON 이벤트를 통째로 붙임:
//   ... task_complete /tmp/file '{"type":"agent-turn-complete","last-assistant-message":"..."}'
//
// 호환을 위해 stdin도 지원. 우선순위: argv-JSON > stdin-JSON > argv-text > 기본문구.

const fs = require('fs');

const DEFAULT_EVENT = process.argv[2] || 'task_complete';
const NOTIFY_FILE = process.argv[3];
const TAIL = process.argv.slice(4).join(' ');

if (!NOTIFY_FILE) process.exit(0);

let written = false;

const argData = tryParseJson(TAIL);
const hasArgJson = argData !== null;

if (hasArgJson) {
    finish(extractText(argData), argData);
} else if (process.stdin.isTTY) {
    finish(TAIL, {});
} else {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => {
        const stdinData = tryParseJson(raw);
        if (stdinData) finish(extractText(stdinData), stdinData);
        else           finish(TAIL || raw.trim() || 'Codex notification', {});
    });
    // 200ms 내 stdin이 안 닫히면 argv-text로 종료
    setTimeout(() => {
        try { process.stdin.pause(); } catch (_) {}
        finish(TAIL || 'Codex notification', {});
    }, 200).unref();
}

function tryParseJson(s) {
    if (!s) return null;
    const t = s.trim();
    if (!t.startsWith('{') && !t.startsWith('[')) return null;
    try { return JSON.parse(t); } catch (_) { return null; }
}

function extractText(data) {
    // Codex 표준 이벤트 키 우선
    if (data['last-assistant-message']) return String(data['last-assistant-message']);
    if (data.message)                   return String(data.message);
    if (data.text)                      return String(data.text);
    if (data.type)                      return String(data.type);
    return 'Codex notification';
}

function mapEvent(data) {
    // Codex의 type을 우리 event 스키마로 매핑
    const type = data && data.type;
    if (type === 'agent-turn-complete') return 'task_complete';
    if (type === 'agent-message')       return 'question';
    if (type === 'error')               return 'error';
    return DEFAULT_EVENT;
}

function finish(text, data) {
    if (written) return;
    written = true;
    try {
        const event = mapEvent(data);
        const payload = {
            source: 'codex',
            event,
            text: (text && String(text).slice(0, 500)) || 'Codex notification',
            ts: Date.now(),
            raw: data
        };
        fs.writeFileSync(NOTIFY_FILE, JSON.stringify(payload));
    } catch (e) {
        process.stderr.write(`ccn: write failed: ${e.message}\n`);
    }
    process.exit(0);
}
