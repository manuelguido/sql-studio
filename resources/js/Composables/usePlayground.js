import { computed, ref, watch } from 'vue';
import { parseSql } from './useSqlParser.js';

// ─── localStorage keys (with legacy fallback) ──────────────────
const LS_RAW   = 'sql-studio.rawSQL';
const LS_SAVED = 'sql-studio.savedSQL';
const LS_UI    = 'sql-studio.uiState';
const LS_MODE  = 'sql-studio.mode';

const LEGACY_RAW   = 'sql-studio.rawSQL';
const LEGACY_SAVED = 'sql-studio.savedSQL';
const LEGACY_UI    = 'sql-studio.uiState';

// ─── Default sample (used on first visit) ──────────────────────
const SAMPLE_SQL = `-- SQL Studio — schema design + inspection
-- Edit visually in Design mode, or write SQL directly in Inspect mode.

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

// ─── safe LS helpers ───────────────────────────────────────────
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

// ─── Initial state (with one-shot legacy migration) ────────────
const initialSaved = safeRead(LS_SAVED, safeRead(LEGACY_SAVED, SAMPLE_SQL));
const initialRaw   = safeRead(LS_RAW,   safeRead(LEGACY_RAW,   initialSaved));
const initialUi    = safeReadJson(LS_UI, safeReadJson(LEGACY_UI, { selectedTable: null, positions: {} }));
const initialMode  = safeRead(LS_MODE, 'inspect') === 'design' ? 'design' : 'inspect';

const rawSQL   = ref(initialRaw);
const savedSQL = ref(initialSaved);
const uiState  = ref({
    selectedTable: initialUi.selectedTable ?? null,
    selectedRelation: null,
    positions: initialUi.positions ?? {},
});
const mode = ref(initialMode);

// ─── Debounced parse ───────────────────────────────────────────
let parseTimer = null;
const dbSchema = ref(parseSql(rawSQL.value));

function scheduleReparse() {
    if (parseTimer) clearTimeout(parseTimer);
    parseTimer = setTimeout(() => {
        dbSchema.value = parseSql(rawSQL.value);
    }, 200);
}

watch(rawSQL, scheduleReparse);

// ─── Persistence ───────────────────────────────────────────────
let rawTimer = null;
watch(rawSQL, (v) => {
    if (rawTimer) clearTimeout(rawTimer);
    rawTimer = setTimeout(() => {
        try { localStorage.setItem(LS_RAW, v); } catch { /* quota */ }
    }, 300);
});

watch(uiState, (v) => {
    try {
        localStorage.setItem(LS_UI, JSON.stringify({
            selectedTable: v.selectedTable,
            positions: v.positions,
        }));
    } catch { /* quota */ }
}, { deep: true });

watch(mode, (v) => {
    try { localStorage.setItem(LS_MODE, v); } catch { /* quota */ }
});

// ─── Derived ───────────────────────────────────────────────────
const isDirty       = computed(() => rawSQL.value !== savedSQL.value);
const selectedTable = computed(() =>
    dbSchema.value.tables.find((t) => t.name === uiState.value.selectedTable) ?? null,
);
const selectedRelation = computed(() => uiState.value.selectedRelation);

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
    uiState.value  = { selectedTable: null, selectedRelation: null, positions: {} };
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
    uiState.value = { ...uiState.value, selectedTable: name, selectedRelation: null };
}

function selectRelation(rel) {
    // rel: { from, to, column, refColumn } | null
    uiState.value = { ...uiState.value, selectedRelation: rel, selectedTable: null };
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

/**
 * Auto-layout: dependency-aware grid.
 * Tables ordered by FK depth (roots first, dependents below) and arranged
 * left-to-right in rows of up to 4 nodes.
 */
function autoLayout() {
    const tables = dbSchema.value.tables;
    if (!tables.length) {
        resetPositions();
        return;
    }

    const byName = new Map(tables.map((t) => [t.name, t]));
    const depth = new Map();

    function depthOf(name, stack = new Set()) {
        if (depth.has(name)) return depth.get(name);
        if (stack.has(name)) return 0; // cycle guard
        const t = byName.get(name);
        if (!t) return 0;
        stack.add(name);
        let d = 0;
        for (const fk of t.foreignKeys) {
            if (fk.refTable !== name && byName.has(fk.refTable)) {
                d = Math.max(d, depthOf(fk.refTable, stack) + 1);
            }
        }
        stack.delete(name);
        depth.set(name, d);
        return d;
    }

    tables.forEach((t) => depthOf(t.name));

    const rows = new Map();
    for (const t of tables) {
        const d = depth.get(t.name) ?? 0;
        if (!rows.has(d)) rows.set(d, []);
        rows.get(d).push(t.name);
    }

    const colW = 280;
    const rowH = 300;
    const positions = {};
    const ordered = [...rows.keys()].sort((a, b) => a - b);
    ordered.forEach((d, rowIdx) => {
        const names = rows.get(d);
        names.forEach((name, colIdx) => {
            positions[name] = {
                x: 60 + colIdx * (colW + 60),
                y: 60 + rowIdx * rowH,
            };
        });
    });

    uiState.value = { ...uiState.value, positions };
}

function setMode(next) {
    if (next !== 'design' && next !== 'inspect') return;
    mode.value = next;
}

export function usePlayground() {
    return {
        // state
        rawSQL,
        savedSQL,
        dbSchema,
        uiState,
        mode,
        // derived
        isDirty,
        selectedTable,
        selectedRelation,
        // actions
        save,
        cancel,
        loadFromText,
        downloadAsFile,
        selectTable,
        selectRelation,
        setPosition,
        resetPositions,
        autoLayout,
        setMode,
    };
}
