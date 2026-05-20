#!/usr/bin/env node
// Claude Code가 hook으로 호출하는 스크립트.
// 인자: <section> <notify_file> <sentinel...>
// stdin으로 Claude의 hook payload JSON을 받음.

const fs = require('fs');

const SECTION = process.argv[2] || 'Notification';
const NOTIFY_FILE = process.argv[3];

if (!NOTIFY_FILE) process.exit(0);

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
    let data = {};
    try { data = JSON.parse(raw); } catch (_) { /* ignore */ }

    const event = sectionToEvent(SECTION, data);
    const text = pickText(SECTION, data);

    try {
        fs.writeFileSync(NOTIFY_FILE, JSON.stringify({
            source: 'claude',
            event,
            text,
            ts: Date.now(),
            raw: data
        }));
    } catch (e) {
        process.stderr.write(`ccn: write failed: ${e.message}\n`);
    }
    process.exit(0);
});

function sectionToEvent(section, data) {
    if (section === 'Stop')         return 'task_complete';
    if (section === 'SubagentStop') return 'subagent_stop';
    if (section === 'PreToolUse')   return 'dangerous_tool';
    const nt = (data && data.notification_type) || '';
    if (nt === 'permission_prompt')   return 'permission_prompt';
    if (nt === 'elicitation_dialog')  return 'elicitation_dialog';
    if (nt === 'idle_prompt')         return 'task_complete';
    if (nt === 'subagent_stop')       return 'subagent_stop';
    return nt || 'notification';
}

function pickText(section, data) {
    if (!data) return section;
    if (section === 'PreToolUse') {
        const tool = data.tool_name || 'tool';
        const detail = formatToolInput(data.tool_input);
        return detail ? `${tool} → ${detail}` : `${tool} 호출`;
    }
    if (data.message) return String(data.message);
    if (section === 'Stop')         return 'Claude 작업 완료';
    if (section === 'SubagentStop') return '서브에이전트 종료';
    return String(data.notification_type || section);
}

function formatToolInput(input) {
    if (!input) return '';
    if (typeof input === 'string') return input.slice(0, 100);
    try {
        if (input.command)   return String(input.command).slice(0, 100);
        if (input.file_path) return String(input.file_path).slice(0, 100);
        if (input.path)      return String(input.path).slice(0, 100);
        const first = Object.values(input)[0];
        if (typeof first === 'string') return first.slice(0, 100);
    } catch (_) {}
    return '';
}
