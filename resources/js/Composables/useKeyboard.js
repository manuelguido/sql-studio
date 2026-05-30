/**
 * useKeyboard — global shortcut binding for the playground.
 *
 * Bind once from the page root (Index.vue). Active element is checked so we
 * never steal Cmd+C / Cmd+Z from text inputs and textareas.
 */
import { onMounted, onUnmounted } from 'vue';
import { usePlayground } from './usePlayground.js';
import { useSchemaEditor } from './useSchemaEditor.js';
import { useHistory } from './useHistory.js';
import { useClipboard } from './useClipboard.js';

const TEXT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isInTextField() {
	const el = document.activeElement;
	if (!el) return false;
	if (TEXT_TAGS.has((el.tagName || '').toUpperCase())) return true;
	if (el.isContentEditable) return true;
	return false;
}

export function useKeyboard() {
	const { selectedTable, selectedRelation, selectTable, selectRelation } = usePlayground();
	const { removeTable, removeForeignKey } = useSchemaEditor();
	const { undo, redo } = useHistory();
	const { copySelection, paste } = useClipboard();

	function onKey(e) {
		const meta = e.metaKey || e.ctrlKey;
		const inText = isInTextField();

		// Esc — always: clear selection, blur active input.
		if (e.key === 'Escape') {
			if (inText) {
				e.preventDefault();
				document.activeElement.blur();
				return;
			}
			if (selectedTable.value || selectedRelation.value) {
				e.preventDefault();
				selectTable(null);
				selectRelation(null);
			}
			return;
		}

		// Don't intercept anything else inside text inputs.
		if (inText) return;

		// Undo / Redo
		if (meta && (e.key === 'z' || e.key === 'Z')) {
			e.preventDefault();
			if (e.shiftKey) redo();
			else undo();
			return;
		}
		if (meta && (e.key === 'y' || e.key === 'Y')) {
			e.preventDefault();
			redo();
			return;
		}

		// Copy / Paste (table-level, in-memory clipboard)
		if (meta && (e.key === 'c' || e.key === 'C')) {
			if (selectedTable.value) {
				e.preventDefault();
				copySelection();
			}
			return;
		}
		if (meta && (e.key === 'v' || e.key === 'V')) {
			e.preventDefault();
			paste();
			return;
		}

		// Delete selected
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (selectedRelation.value) {
				e.preventDefault();
				removeForeignKey(selectedRelation.value);
				return;
			}
			if (selectedTable.value) {
				e.preventDefault();
				removeTable(selectedTable.value.name);
				return;
			}
		}
	}

	onMounted(() => window.addEventListener('keydown', onKey));
	onUnmounted(() => window.removeEventListener('keydown', onKey));
}
