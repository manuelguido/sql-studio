/**
 * useSchemaEditor — mutation actions over the parsed schema.
 *
 * Each mutation:
 *   1. Clones `dbSchema` (deep, structural)
 *   2. Applies the change
 *   3. Serializes back to SQL
 *   4. Sets `rawSQL` (parser will then re-derive the canonical schema)
 *
 * SQL is the single source of truth in BOTH modes. Visual edits round-trip
 * through the serializer + parser, guaranteeing a consistent schema.
 */
import { usePlayground } from './usePlayground.js';
import { serializeSchema } from './useSqlSerializer.js';

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

function uniqueTableName(schema, base = 'new_table') {
    const taken = new Set(schema.tables.map((t) => t.name));
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
}

function uniqueColumnName(table, base = 'column') {
    const taken = new Set(table.columns.map((c) => c.name));
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
}

export function useSchemaEditor() {
    const { dbSchema, rawSQL, selectTable, selectRelation, setPosition } = usePlayground();

    function commit(next) {
        const sql = serializeSchema(next);
        rawSQL.value = sql;
    }

    function findTable(schema, name) {
        return schema.tables.find((t) => t.name === name) || null;
    }

    function addTable(opts = {}) {
        const next = cloneSchema(dbSchema.value);
        const name = uniqueTableName(next, opts.name || 'new_table');
        next.tables.push({
            name,
            columns: [
                { name: 'id', type: 'INTEGER', pk: true, nullable: false, unique: false, default: null },
            ],
            primaryKey: ['id'],
            foreignKeys: [],
        });
        commit(next);

        // Place new table where the user can see it (top-left of empty zone).
        const placedCount = next.tables.length - 1;
        const col = placedCount % 4;
        const row = Math.floor(placedCount / 4);
        setPosition(name, { x: 40 + col * 320, y: 40 + row * 280 });
        selectTable(name);
        return name;
    }

    function removeTable(tableName) {
        const next = cloneSchema(dbSchema.value);
        next.tables = next.tables.filter((t) => t.name !== tableName);
        // Cascade-strip any FKs pointing to the removed table.
        for (const t of next.tables) {
            t.foreignKeys = t.foreignKeys.filter((fk) => fk.refTable !== tableName);
        }
        commit(next);
        selectTable(null);
    }

    function renameTable(oldName, newName) {
        const trimmed = String(newName || '').trim();
        if (!trimmed || trimmed === oldName) return;
        const next = cloneSchema(dbSchema.value);
        if (next.tables.some((t) => t.name === trimmed)) return; // collision
        for (const t of next.tables) {
            if (t.name === oldName) t.name = trimmed;
            for (const fk of t.foreignKeys) {
                if (fk.refTable === oldName) fk.refTable = trimmed;
            }
        }
        commit(next);
        selectTable(trimmed);
    }

    function addColumn(tableName, partial = {}) {
        const next = cloneSchema(dbSchema.value);
        const table = findTable(next, tableName);
        if (!table) return;
        const name = uniqueColumnName(table, partial.name || 'column');
        table.columns.push({
            name,
            type: partial.type || 'TEXT',
            pk: !!partial.pk,
            nullable: partial.nullable !== false,
            unique: !!partial.unique,
            default: partial.default ?? null,
        });
        if (partial.pk) {
            if (!table.primaryKey.includes(name)) table.primaryKey.push(name);
        }
        commit(next);
    }

    function updateColumn(tableName, columnName, patch) {
        const next = cloneSchema(dbSchema.value);
        const table = findTable(next, tableName);
        if (!table) return;
        const col = table.columns.find((c) => c.name === columnName);
        if (!col) return;

        const nextName = patch.name !== undefined ? String(patch.name).trim() : col.name;
        const renamed = nextName && nextName !== col.name;
        if (renamed) {
            // Keep PK list and FKs (this column or referencing it) consistent.
            if (table.columns.some((c) => c !== col && c.name === nextName)) return;
            const old = col.name;
            col.name = nextName;
            table.primaryKey = table.primaryKey.map((c) => (c === old ? nextName : c));
            for (const fk of table.foreignKeys) {
                if (fk.column === old) fk.column = nextName;
            }
            for (const t of next.tables) {
                for (const fk of t.foreignKeys) {
                    if (fk.refTable === tableName && fk.refColumn === old) fk.refColumn = nextName;
                }
            }
        }

        if (patch.type !== undefined)     col.type = String(patch.type).toUpperCase().replace(/\s+/g, '');
        if (patch.nullable !== undefined) col.nullable = !!patch.nullable;
        if (patch.unique !== undefined)   col.unique = !!patch.unique;
        if (patch.default !== undefined)  col.default = patch.default || null;

        if (patch.pk !== undefined) {
            col.pk = !!patch.pk;
            const set = new Set(table.primaryKey);
            if (col.pk) set.add(col.name); else set.delete(col.name);
            table.primaryKey = [...set];
            // PKs are implicitly NOT NULL.
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
        // Drop any incoming FK whose ref column is gone.
        for (const t of next.tables) {
            t.foreignKeys = t.foreignKeys.filter(
                (fk) => !(fk.refTable === tableName && fk.refColumn === columnName),
            );
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
        // De-dupe identical FK.
        const exists = src.foreignKeys.some(
            (fk) => fk.column === fromColumn && fk.refTable === toTable && fk.refColumn === toColumn,
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
            (fk) => !(fk.column === column && fk.refTable === to && fk.refColumn === refColumn),
        );
        commit(next);
        selectRelation(null);
    }

    return {
        addTable,
        removeTable,
        renameTable,
        addColumn,
        updateColumn,
        removeColumn,
        addForeignKey,
        removeForeignKey,
    };
}
