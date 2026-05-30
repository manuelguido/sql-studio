/**
 * useClipboard — table-level copy/paste for the schema designer.
 *
 * Clipboard is in-memory only (does NOT touch the system clipboard) so
 * Cmd+C / Cmd+V never fight with the browser's text-copy behavior in inputs.
 * Pasted tables get a unique name and a small offset position.
 */
import { ref } from 'vue';
import { usePlayground } from './usePlayground.js';
import { useSchemaEditor } from './useSchemaEditor.js';
import { sanitizeIdentifier, uniqueName } from './useNaming.js';

const buffer = ref(null); // { name, columns, primaryKey, foreignKeys, position? }

function cloneTable(t) {
	return {
		name: t.name,
		columns: t.columns.map((c) => ({ ...c })),
		primaryKey: [...(t.primaryKey || [])],
		foreignKeys: t.foreignKeys.map((fk) => ({ ...fk })),
	};
}

export function useClipboard() {
	const { dbSchema, uiState, selectedTable, setPosition, selectTable } = usePlayground();
	const { pasteTable } = useSchemaEditor();

	function copySelection() {
		const t = selectedTable.value;
		if (!t) return false;
		const clone = cloneTable(t);
		clone.position = uiState.value.positions?.[t.name] ?? null;
		buffer.value = clone;
		return true;
	}

	function paste() {
		if (!buffer.value) return null;
		const taken = new Set(dbSchema.value.tables.map((t) => t.name));
		const baseName = sanitizeIdentifier(`${buffer.value.name}_copy`, 'table_copy');
		const newName = uniqueName(baseName, taken);

		const placed = pasteTable({
			name: newName,
			columns: buffer.value.columns.map((c) => ({ ...c })),
			primaryKey: [...buffer.value.primaryKey],
			// FKs are dropped on paste — references would dangle if the target
			// table doesn't exist, and copying within a project is the common case.
			foreignKeys: [],
		});

		if (placed && buffer.value.position) {
			setPosition(newName, {
				x: buffer.value.position.x + 24,
				y: buffer.value.position.y + 24,
			});
		}
		if (placed) selectTable(newName);
		return placed;
	}

	function hasClip() {
		return !!buffer.value;
	}

	return { copySelection, paste, hasClip };
}
