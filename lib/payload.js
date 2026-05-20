const DEFAULT_ALLOWED = ['permission_prompt', 'elicitation_dialog', 'question', 'task_complete', 'idle_prompt', 'stop', 'subagent_stop', 'error'];

function parsePayload(raw) {
    if (typeof raw !== 'string') return { source: 'agent', event: 'notification', text: '' };
    const trimmed = raw.trim();
    if (!trimmed) return { source: 'agent', event: 'notification', text: '' };
    try {
        const d = JSON.parse(trimmed);
        return {
            source: typeof d.source === 'string' ? d.source : 'agent',
            event: typeof d.event === 'string' ? d.event : 'notification',
            text: typeof d.text === 'string' && d.text ? d.text : (d.message || d.event || trimmed)
        };
    } catch (_) {
        return { source: 'agent', event: 'notification', text: trimmed };
    }
}

function isAllowedEvent(event, allowed) {
    const list = Array.isArray(allowed) ? allowed : DEFAULT_ALLOWED;
    return list.includes(event);
}

module.exports = { parsePayload, isAllowedEvent, DEFAULT_ALLOWED };
