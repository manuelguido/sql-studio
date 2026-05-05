import { computed, ref, watch } from 'vue';
import { parseSql } from './useSqlParser.js';

// ─── localStorage keys ─────────────────────────────────────────
const LS_RAW   = 'query-lens.rawSQL';
const LS_SAVED = 'query-lens.savedSQL';
const LS_UI    = 'query-lens.uiState';

// ─── Default sample (used on first visit) ──────────────────────
const SAMPLE_SQL = `-- Query Lens — SQL Playground
-- Edit, save, and visualize your schema.

CREATE TABLE users (
    id           INTEGER PRIMARY KEY,
    email        VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(120),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE projects (
    id          INTEGER PRIMARY KEY,
    owner_id    INTEGER NOT NULL REFERENCES users(id),
    name        VARCHAR(120) NOT NULL,
    description TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tasks (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id),
    assignee_id INTEGER REFERENCES users(id),
    title       VARCHAR(200) NOT NULL,
    status      VARCHAR(20) DEFAULT 'open',
    due_at      TIMESTAMP
);

CREATE TABLE comments (
    id        INTEGER PRIMARY KEY,
    task_id   INTEGER NOT NULL REFERENCES tasks(id),
    author_id INTEGER NOT NULL REFERENCES users(id),
    body      TEXT NOT NULL,
    posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

// ─── Module-scope singletons (one instance app-wide) ───────────
function safeRead(key, fallback) {
    try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : v;
    } catch {
        return fallback;
    }
}

function safeReadJson(key, fallback) {
    try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
    } catch {
        return fallback;
    }
}

const initialSaved = safeRead(LS_SAVED, SAMPLE_SQL);
const initialRaw   = safeRead(LS_RAW, initialSaved);
const initialUi    = safeReadJson(LS_UI, { selectedTable: null, positions: {} });

const rawSQL   = ref(initialRaw);
const savedSQL = ref(initialSaved);
const uiState  = ref(initialUi);

// Debounced parse
let parseTimer = null;
const dbSchema = ref(parseSql(rawSQL.value));

function scheduleReparse() {
    if (parseTimer) clearTimeout(parseTimer);
    parseTimer = setTimeout(() => {
        dbSchema.value = parseSql(rawSQL.value);
    }, 200);
}

watch(rawSQL, scheduleReparse);

// Debounced persistence of rawSQL (autosave-as-draft)
let rawTimer = null;
watch(rawSQL, (v) => {
    if (rawTimer) clearTimeout(rawTimer);
    rawTimer = setTimeout(() => {
        try { localStorage.setItem(LS_RAW, v); } catch { /* quota */ }
    }, 300);
});

// uiState persists immediately (small payload)
watch(uiState, (v) => {
    try { localStorage.setItem(LS_UI, JSON.stringify(v)); } catch { /* quota */ }
}, { deep: true });

// ─── Derived ───────────────────────────────────────────────────
const isDirty       = computed(() => rawSQL.value !== savedSQL.value);
const selectedTable = computed(() =>
    dbSchema.value.tables.find((t) => t.name === uiState.value.selectedTable) ?? null,
);

// ─── Actions ───────────────────────────────────────────────────
function save() {
    savedSQL.value = rawSQL.value;
    try {
        localStorage.setItem(LS_SAVED, savedSQL.value);
        localStorage.setItem(LS_RAW, rawSQL.value);
    } catch { /* quota */ }
}

function cancel() {
    rawSQL.value = savedSQL.value;
    dbSchema.value = parseSql(rawSQL.value);
}

function loadFromText(text) {
    rawSQL.value   = text;
    savedSQL.value = text;
    uiState.value  = { selectedTable: null, positions: {} };
    dbSchema.value = parseSql(text);
    try {
        localStorage.setItem(LS_RAW, text);
        localStorage.setItem(LS_SAVED, text);
    } catch { /* quota */ }
}

function downloadAsFile(filename = 'schema.sql') {
    const blob = new Blob([rawSQL.value], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function selectTable(name) {
    uiState.value = { ...uiState.value, selectedTable: name };
}

function setPosition(name, pos) {
    uiState.value = {
        ...uiState.value,
        positions: { ...uiState.value.positions, [name]: pos },
    };
}

function resetPositions() {
    uiState.value = { ...uiState.value, positions: {} };
}

export function usePlayground() {
    return {
        // state
        rawSQL,
        savedSQL,
        dbSchema,
        uiState,
        // derived
        isDirty,
        selectedTable,
        // actions
        save,
        cancel,
        loadFromText,
        downloadAsFile,
        selectTable,
        setPosition,
        resetPositions,
    };
}
