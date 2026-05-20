const vscode = require('vscode');

const STORAGE_KEY = 'ccn.history.items';

class HistoryStore {
    constructor(memento, max) {
        this.memento = memento;
        this.max = max;
        this.items = memento.get(STORAGE_KEY, []);
    }
    setMax(n) {
        this.max = n;
        this._trim();
        this._persist();
    }
    push(item) {
        this.items.unshift(item);
        this._trim();
        this._persist();
    }
    clear() {
        this.items = [];
        this._persist();
    }
    list() {
        return this.items.slice();
    }
    _trim() {
        if (this.items.length > this.max) {
            this.items = this.items.slice(0, this.max);
        }
    }
    _persist() {
        this.memento.update(STORAGE_KEY, this.items);
    }
}

class HistoryTreeProvider {
    constructor(store) {
        this.store = store;
        this._em = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._em.event;
    }
    refresh() { this._em.fire(); }
    getTreeItem(item) {
        const ti = new vscode.TreeItem(
            item.text || item.event,
            vscode.TreeItemCollapsibleState.None
        );
        const dt = new Date(item.ts);
        const hhmm = dt.toLocaleTimeString();
        ti.description = `${labelSource(item.source)} · ${item.event} · ${hhmm}`;
        ti.tooltip = `${dt.toLocaleString()}\n[${item.source}/${item.event}]\n${item.text}`;
        ti.iconPath = new vscode.ThemeIcon(iconFor(item.event));
        return ti;
    }
    getChildren() {
        return Promise.resolve(this.store.list());
    }
}

function labelSource(s) {
    if (s === 'claude') return 'Claude';
    if (s === 'codex') return 'Codex';
    if (s === 'test') return 'Test';
    return s || 'Agent';
}

function iconFor(event) {
    switch (event) {
        case 'permission_prompt': return 'shield';
        case 'elicitation_dialog':
        case 'question':          return 'question';
        case 'task_complete':
        case 'idle_prompt':
        case 'stop':              return 'check';
        case 'subagent_stop':     return 'symbol-class';
        case 'dangerous_tool':    return 'warning';
        case 'error':             return 'error';
        default:                  return 'bell';
    }
}

module.exports = { HistoryStore, HistoryTreeProvider };
