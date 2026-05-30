/**
 * Dialect-tolerant SQL → schema parser.
 * Extracts CREATE TABLE statements only. Ignores everything else.
 *
 * Schema shape:
 *   {
 *     tables: [{
 *       name, columns: [{ name, type, pk, nullable, default, unique }],
 *       primaryKey: [colName, ...],
 *       foreignKeys: [{ column, refTable, refColumn }],
 *     }],
 *     errors: [{ message }],
 *   }
 */

const RESERVED_CONSTRAINTS = new Set([
	'PRIMARY',
	'FOREIGN',
	'UNIQUE',
	'CHECK',
	'CONSTRAINT',
	'KEY',
	'INDEX',
	'FULLTEXT',
	'SPATIAL',
]);

/** Strip line and block comments. */
function stripComments(sql) {
	return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Split a string of comma-separated definitions, respecting nested parens. */
function splitTopLevel(s, sep = ',') {
	const out = [];
	let depth = 0;
	let buf = '';
	let inString = null;

	for (let i = 0; i < s.length; i++) {
		const ch = s[i];

		if (inString) {
			buf += ch;
			if (ch === inString && s[i - 1] !== '\\') inString = null;
			continue;
		}

		if (ch === "'" || ch === '"' || ch === '`') {
			inString = ch;
			buf += ch;
			continue;
		}

		if (ch === '(') depth++;
		else if (ch === ')') depth--;

		if (ch === sep && depth === 0) {
			out.push(buf.trim());
			buf = '';
			continue;
		}

		buf += ch;
	}

	if (buf.trim()) out.push(buf.trim());
	return out;
}

/** Strip enclosing quotes/backticks from an identifier. */
function unquote(id) {
	if (!id) return id;
	return id.replace(/^[`"']|[`"']$/g, '');
}

/** Parse one column or constraint definition from inside CREATE TABLE (...). */
function parseDefinition(def, table) {
	const trimmed = def.trim();
	if (!trimmed) return;

	const upper = trimmed.toUpperCase();
	const firstWord = upper.split(/\s+/)[0];

	// ── Table-level constraint ───────────────────────────────
	if (RESERVED_CONSTRAINTS.has(firstWord)) {
		// CONSTRAINT name TYPE …  → drop the name, recurse on rest
		if (firstWord === 'CONSTRAINT') {
			const rest = trimmed.replace(/^CONSTRAINT\s+\S+\s+/i, '');
			return parseDefinition(rest, table);
		}

		// PRIMARY KEY (col1, col2)
		if (/^PRIMARY\s+KEY/i.test(trimmed)) {
			const m = trimmed.match(/\(([^)]+)\)/);
			if (m) {
				const cols = m[1].split(',').map((c) => unquote(c.trim()));
				table.primaryKey.push(...cols);
				cols.forEach((c) => {
					const col = table.columns.find((x) => x.name === c);
					if (col) col.pk = true;
				});
			}
			return;
		}

		// FOREIGN KEY (col) REFERENCES tbl(col)
		if (/^FOREIGN\s+KEY/i.test(trimmed)) {
			const m = trimmed.match(/\(([^)]+)\)\s+REFERENCES\s+([`"']?[\w]+[`"']?)\s*\(([^)]+)\)/i);
			if (m) {
				const cols = m[1].split(',').map((c) => unquote(c.trim()));
				const refTbl = unquote(m[2]);
				const refCols = m[3].split(',').map((c) => unquote(c.trim()));
				cols.forEach((c, i) => {
					table.foreignKeys.push({
						column: c,
						refTable: refTbl,
						refColumn: refCols[i] ?? refCols[0],
					});
				});
			}
			return;
		}

		// UNIQUE (col)
		if (/^UNIQUE/i.test(trimmed)) {
			const m = trimmed.match(/\(([^)]+)\)/);
			if (m) {
				m[1]
					.split(',')
					.map((c) => unquote(c.trim()))
					.forEach((c) => {
						const col = table.columns.find((x) => x.name === c);
						if (col) col.unique = true;
					});
			}
			return;
		}

		// KEY/INDEX/CHECK — ignore
		return;
	}

	// ── Column definition ────────────────────────────────────
	// First token = column name, second = type (may include parens)
	const tokens = trimmed.match(/^([`"']?[\w]+[`"']?)\s+([A-Za-z][A-Za-z0-9_]*(?:\s*\([^)]*\))?)(.*)$/);
	if (!tokens) return;

	const name = unquote(tokens[1]);
	const type = tokens[2].toUpperCase().replace(/\s+/g, '');
	const modifiers = tokens[3] || '';
	const modUpper = modifiers.toUpperCase();

	const column = {
		name,
		type,
		pk: /\bPRIMARY\s+KEY\b/i.test(modifiers),
		nullable: !/\bNOT\s+NULL\b/i.test(modifiers),
		unique: /\bUNIQUE\b/i.test(modifiers),
		default: null,
	};

	// DEFAULT value (best-effort, single token or quoted)
	const defMatch = modifiers.match(/\bDEFAULT\s+('[^']*'|"[^"]*"|[A-Za-z0-9_().]+(?:\s*\([^)]*\))?)/i);
	if (defMatch) column.default = defMatch[1].trim();

	table.columns.push(column);
	if (column.pk) table.primaryKey.push(name);

	// Inline REFERENCES tbl(col)
	const ref = modifiers.match(/\bREFERENCES\s+([`"']?[\w]+[`"']?)\s*\(([^)]+)\)/i);
	if (ref) {
		table.foreignKeys.push({
			column: name,
			refTable: unquote(ref[1]),
			refColumn: unquote(ref[2].trim()),
		});
	}
}

/** Main entry: SQL string → schema object. */
export function parseSql(sql) {
	const schema = { tables: [], errors: [] };
	if (!sql || !sql.trim()) return schema;

	const cleaned = stripComments(sql);

	// Split on `;` but respect parens / strings
	const statements = splitTopLevel(cleaned, ';').filter((s) => s.trim());

	for (const stmt of statements) {
		const m = stmt.match(
			/CREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"']?[\w.]+[`"']?)\s*\(/i
		);
		if (!m) continue;

		// Find the matching closing paren of CREATE TABLE name (
		const openIdx = stmt.indexOf('(', m.index);
		if (openIdx === -1) continue;

		let depth = 0;
		let closeIdx = -1;
		for (let i = openIdx; i < stmt.length; i++) {
			if (stmt[i] === '(') depth++;
			else if (stmt[i] === ')') {
				depth--;
				if (depth === 0) {
					closeIdx = i;
					break;
				}
			}
		}
		if (closeIdx === -1) {
			schema.errors.push({ message: `Unclosed parenthesis near table ${m[1]}` });
			continue;
		}

		const name = unquote(m[1]).split('.').pop(); // drop schema. prefix
		const body = stmt.slice(openIdx + 1, closeIdx);

		const table = {
			name,
			columns: [],
			primaryKey: [],
			foreignKeys: [],
		};

		const defs = splitTopLevel(body, ',');
		for (const def of defs) parseDefinition(def, table);

		// Dedupe primary key list
		table.primaryKey = [...new Set(table.primaryKey)];

		schema.tables.push(table);
	}

	return schema;
}
