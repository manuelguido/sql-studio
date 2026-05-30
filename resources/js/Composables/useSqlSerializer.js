/**
 * Schema → SQL serializer.
 *
 * Emits canonical CREATE TABLE statements. Used by the design-mode editor to
 * keep the SQL editor in sync with visual mutations.
 *
 * Round-trip contract with `useSqlParser`:
 *   parse(serialize(schema)) ≅ schema
 */

const RESERVED = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteIdent(name) {
	if (!name) return '""';
	return RESERVED.test(name) ? name : `"${String(name).replace(/"/g, '""')}"`;
}

function formatDefault(value) {
	if (value === null || value === undefined || value === '') return null;
	const s = String(value).trim();
	if (!s) return null;
	return s;
}

/**
 * Serialize a single column definition.
 * Inline PRIMARY KEY is only emitted when the table has a single-column PK
 * matching this column (kept consistent with parser expectations).
 */
function serializeColumn(col, opts) {
	const parts = [quoteIdent(col.name), col.type || 'TEXT'];

	if (opts.inlinePrimaryKey && col.pk) parts.push('PRIMARY KEY');
	if (col.nullable === false) parts.push('NOT NULL');
	if (col.unique && !col.pk) parts.push('UNIQUE');

	const def = formatDefault(col.default);
	if (def !== null) parts.push(`DEFAULT ${def}`);

	return parts.join(' ');
}

function serializeTableLevelPk(pkCols) {
	if (!pkCols.length) return null;
	const cols = pkCols.map(quoteIdent).join(', ');
	return `PRIMARY KEY (${cols})`;
}

function serializeForeignKey(fk) {
	return `FOREIGN KEY (${quoteIdent(fk.column)}) REFERENCES ${quoteIdent(fk.refTable)}(${quoteIdent(fk.refColumn)})`;
}

/**
 * Serialize one table to a CREATE TABLE statement.
 */
export function serializeTable(table) {
	const pkCols = Array.isArray(table.primaryKey) ? table.primaryKey : [];
	const inlinePk = pkCols.length === 1;

	const lines = [];

	for (const col of table.columns) {
		lines.push(serializeColumn(col, { inlinePrimaryKey: inlinePk }));
	}

	if (!inlinePk) {
		const tlpk = serializeTableLevelPk(pkCols);
		if (tlpk) lines.push(tlpk);
	}

	for (const fk of table.foreignKeys || []) {
		lines.push(serializeForeignKey(fk));
	}

	const body = lines.map((l) => `    ${l}`).join(',\n');
	return `CREATE TABLE ${quoteIdent(table.name)} (\n${body}\n);`;
}

/**
 * Serialize a full schema. Returns SQL text terminated with a single newline.
 */
export function serializeSchema(schema) {
	if (!schema || !Array.isArray(schema.tables) || !schema.tables.length) {
		return '';
	}
	return schema.tables.map(serializeTable).join('\n\n') + '\n';
}
