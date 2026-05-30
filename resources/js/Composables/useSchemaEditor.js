/**
 * useSchemaEditor — mutation actions over the parsed schema.
 *
 * Each mutation:
 *   1. Records current state to history (so it can be undone)
 *   2. Clones `dbSchema` (deep, structural)
 *   3. Sanitizes any user-provided identifier
 *   4. Applies the change
 *   5. Serializes back to SQL
 *   6. Sets `rawSQL` (the parser then re-derives the canonical schema)
 *
 * SQL is the single source of truth: visual edits round-trip through the
 * serializer + parser, guaranteeing a consistent schema.
 */
import { usePlayground } from './usePlayground.js';
import { serializeSchema } from './useSqlSerializer.js';
import { useHistory } from './useHistory.js';
import { sanitizeIdentifier, uniqueName } from './useNaming.js';

function cloneSchema(schema) {
	return {
		tables: (schema?.tables || []).map((t) => ({
			name: t.name,
			columns: (t.columns || []).map((c) => ({ ...c })),
			primaryKey: [...(t.primaryKey || [])],
			foreignKeys: (t.foreignKeys || []).map((fk) => ({ ...fk })),
		})),
		errors: [],
	};
}

function tableNameSet(schema) {
	return new Set(schema.tables.map((t) => t.name));
}

function columnNameSet(table) {
	return new Set(table.columns.map((c) => c.name));
}

export function useSchemaEditor() {
	const { dbSchema, rawSQL, selectTable, selectRelation, setPosition } = usePlayground();
	const { record } = useHistory();

	function commit(next) {
		record();
		rawSQL.value = serializeSchema(next);
	}

	function findTable(schema, name) {
		return schema.tables.find((t) => t.name === name) || null;
	}

	function addTable(opts = {}) {
		const next = cloneSchema(dbSchema.value);
		const base = sanitizeIdentifier(opts.name || 'new_table', 'new_table');
		const name = uniqueName(base, tableNameSet(next));
		next.tables.push({
			name,
			columns: [{ name: 'id', type: 'INTEGER', pk: true, nullable: false, unique: false, default: null }],
			primaryKey: ['id'],
			foreignKeys: [],
		});
		commit(next);

		const placedCount = next.tables.length - 1;
		const col = placedCount % 4;
		const row = Math.floor(placedCount / 4);
		setPosition(name, { x: 40 + col * 320, y: 40 + row * 280 });
		selectTable(name);
		return name;
	}

	/**
	 * pasteTable — insert a fully-formed table (used by clipboard/paste).
	 * `tableShape` is { name, columns, primaryKey, foreignKeys }. Name is
	 * sanitized and made unique. Returns the placed name (or null on no-op).
	 */
	function pasteTable(tableShape) {
		if (!tableShape) return null;
		const next = cloneSchema(dbSchema.value);
		const base = sanitizeIdentifier(tableShape.name || 'table_copy', 'table_copy');
		const name = uniqueName(base, tableNameSet(next));
		next.tables.push({
			name,
			columns: (tableShape.columns || []).map((c) => ({ ...c })),
			primaryKey: [...(tableShape.primaryKey || [])],
			foreignKeys: (tableShape.foreignKeys || []).map((fk) => ({ ...fk })),
		});
		commit(next);
		return name;
	}

	function removeTable(tableName) {
		const next = cloneSchema(dbSchema.value);
		next.tables = next.tables.filter((t) => t.name !== tableName);
		// Cascade-strip FKs pointing to the removed table.
		for (const t of next.tables) {
			t.foreignKeys = t.foreignKeys.filter((fk) => fk.refTable !== tableName);
		}
		commit(next);
		selectTable(null);
	}

	function renameTable(oldName, newName) {
		const sanitized = sanitizeIdentifier(newName, oldName);
		if (!sanitized || sanitized === oldName) return;
		const next = cloneSchema(dbSchema.value);
		if (next.tables.some((t) => t.name === sanitized)) return;
		for (const t of next.tables) {
			if (t.name === oldName) t.name = sanitized;
			for (const fk of t.foreignKeys) {
				if (fk.refTable === oldName) fk.refTable = sanitized;
			}
		}
		commit(next);
		selectTable(sanitized);
	}

	function addColumn(tableName, partial = {}) {
		const next = cloneSchema(dbSchema.value);
		const table = findTable(next, tableName);
		if (!table) return;
		const base = sanitizeIdentifier(partial.name || 'column', 'column');
		const name = uniqueName(base, columnNameSet(table));
		table.columns.push({
			name,
			type: partial.type || 'TEXT',
			pk: !!partial.pk,
			nullable: partial.nullable !== false,
			unique: !!partial.unique,
			default: partial.default ?? null,
		});
		if (partial.pk && !table.primaryKey.includes(name)) {
			table.primaryKey.push(name);
		}
		commit(next);
	}

	function updateColumn(tableName, columnName, patch) {
		const next = cloneSchema(dbSchema.value);
		const table = findTable(next, tableName);
		if (!table) return;
		const col = table.columns.find((c) => c.name === columnName);
		if (!col) return;

		if (patch.name !== undefined) {
			const sanitized = sanitizeIdentifier(patch.name, col.name);
			if (sanitized && sanitized !== col.name) {
				if (table.columns.some((c) => c !== col && c.name === sanitized)) return;
				const old = col.name;
				col.name = sanitized;
				table.primaryKey = table.primaryKey.map((c) => (c === old ? sanitized : c));
				for (const fk of table.foreignKeys) {
					if (fk.column === old) fk.column = sanitized;
				}
				for (const t of next.tables) {
					for (const fk of t.foreignKeys) {
						if (fk.refTable === tableName && fk.refColumn === old) fk.refColumn = sanitized;
					}
				}
			}
		}

		if (patch.type !== undefined) col.type = String(patch.type).toUpperCase().replace(/\s+/g, '');
		if (patch.nullable !== undefined) col.nullable = !!patch.nullable;
		if (patch.unique !== undefined) col.unique = !!patch.unique;
		if (patch.default !== undefined) col.default = patch.default || null;

		if (patch.pk !== undefined) {
			col.pk = !!patch.pk;
			const set = new Set(table.primaryKey);
			if (col.pk) set.add(col.name);
			else set.delete(col.name);
			table.primaryKey = [...set];
			if (col.pk) col.nullable = false;
		}

		commit(next);
	}

	function removeColumn(tableName, columnName) {
		const next = cloneSchema(dbSchema.value);
		const table = findTable(next, tableName);
		if (!table) return;
		table.columns = table.columns.filter((c) => c.name !== columnName);
		table.primaryKey = table.primaryKey.filter((c) => c !== columnName);
		table.foreignKeys = table.foreignKeys.filter((fk) => fk.column !== columnName);
		for (const t of next.tables) {
			t.foreignKeys = t.foreignKeys.filter((fk) => !(fk.refTable === tableName && fk.refColumn === columnName));
		}
		commit(next);
	}

	function addForeignKey({ fromTable, fromColumn, toTable, toColumn }) {
		if (!fromTable || !fromColumn || !toTable || !toColumn) return;
		if (fromTable === toTable && fromColumn === toColumn) return;
		const next = cloneSchema(dbSchema.value);
		const src = findTable(next, fromTable);
		const dst = findTable(next, toTable);
		if (!src || !dst) return;
		if (!src.columns.some((c) => c.name === fromColumn)) return;
		if (!dst.columns.some((c) => c.name === toColumn)) return;
		const exists = src.foreignKeys.some(
			(fk) => fk.column === fromColumn && fk.refTable === toTable && fk.refColumn === toColumn
		);
		if (exists) return;
		src.foreignKeys.push({ column: fromColumn, refTable: toTable, refColumn: toColumn });
		commit(next);
		selectRelation({ from: fromTable, to: toTable, column: fromColumn, refColumn: toColumn });
	}

	function removeForeignKey({ from, column, to, refColumn }) {
		const next = cloneSchema(dbSchema.value);
		const src = findTable(next, from);
		if (!src) return;
		src.foreignKeys = src.foreignKeys.filter(
			(fk) => !(fk.column === column && fk.refTable === to && fk.refColumn === refColumn)
		);
		commit(next);
		selectRelation(null);
	}

	return {
		addTable,
		pasteTable,
		removeTable,
		renameTable,
		addColumn,
		updateColumn,
		removeColumn,
		addForeignKey,
		removeForeignKey,
	};
}
