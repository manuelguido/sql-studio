/**
 * useHistory — single global undo/redo stack for the playground.
 *
 * State captured per snapshot: { rawSQL, positions }
 * Mutations explicitly call `record()` BEFORE applying their change so the
 * stack preserves "the state we want to come back to". Undo/redo writes
 * straight to the playground refs and does NOT itself record (suppressed
 * via the `applying` flag).
 */
import { computed, ref } from 'vue';
import { usePlayground } from './usePlayground.js';

const past   = ref([]);    // states older than current
const future = ref([]);    // states newer than current (filled by undo)
const MAX    = 100;

let applying = false;

function snapshot() {
    const { rawSQL, uiState } = usePlayground();
    return {
        rawSQL: rawSQL.value,
        positions: { ...(uiState.value.positions || {}) },
    };
}

function apply(snap) {
    const { rawSQL, uiState } = usePlayground();
    applying = true;
    rawSQL.value = snap.rawSQL;
    uiState.value = {
        ...uiState.value,
        positions: { ...snap.positions },
    };
    // release on next tick so debounced reparse doesn't accidentally record
    setTimeout(() => { applying = false; }, 0);
}

function record() {
    if (applying) return;
    past.value.push(snapshot());
    if (past.value.length > MAX) past.value.shift();
    if (future.value.length) future.value = [];
}

function undo() {
    if (!past.value.length) return;
    const prev = past.value.pop();
    future.value.push(snapshot());
    apply(prev);
}

function redo() {
    if (!future.value.length) return;
    const next = future.value.pop();
    past.value.push(snapshot());
    apply(next);
}

function clear() {
    past.value = [];
    future.value = [];
}

const canUndo = computed(() => past.value.length > 0);
const canRedo = computed(() => future.value.length > 0);

export function useHistory() {
    return { record, undo, redo, clear, canUndo, canRedo };
}

export function isApplyingHistory() {
    return applying;
}
