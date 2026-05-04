// ─── Token type identifiers ────────────────────────────────────
const T_KEYWORD  = 'keyword';
const T_TYPE     = 'type';
const T_STRING   = 'string';
const T_NUMBER   = 'number';
const T_COMMENT  = 'comment';
const T_OPERATOR = 'operator';
const T_PUNCT    = 'punct';
// Identifiers and whitespace are emitted as plain text (no span).

// ─── Keyword sets (case-insensitive lookup) ─────────────────────
const KEYWORDS = new Set([
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL',
    'LIKE', 'ILIKE', 'BETWEEN', 'EXISTS',
    'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL', 'CROSS', 'NATURAL',
    'ON', 'USING', 'AS',
    'UNION', 'INTERSECT', 'EXCEPT', 'ALL', 'DISTINCT',
    'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'FETCH', 'ROWS', 'ONLY',
    'CREATE', 'TABLE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME',
    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'REPLACE',
    'ADD', 'COLUMN', 'INDEX', 'VIEW', 'SCHEMA', 'DATABASE',
    'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'CHECK',
    'CONSTRAINT', 'DEFAULT', 'TEMP', 'TEMPORARY', 'IF',
    'WITH', 'RECURSIVE', 'MATERIALIZED', 'LATERAL', 'CONCURRENTLY',
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'BEGIN', 'TRANSACTION', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
    'TRIGGER', 'PROCEDURE', 'FUNCTION', 'RETURNS', 'RETURN', 'DECLARE',
    'TO', 'CASCADE', 'RESTRICT', 'DEFERRABLE', 'INITIALLY', 'DEFERRED', 'IMMEDIATE',
    'COLLATE', 'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST',
    'PARTITION', 'OVER', 'WINDOW', 'FILTER', 'WITHIN', 'RANGE',
    'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW',
    'GRANT', 'REVOKE', 'PRIVILEGES', 'PUBLIC',
    'EXPLAIN', 'ANALYZE', 'VERBOSE', 'WITHOUT',
]);

const TYPES = new Set([
    'INTEGER', 'INT', 'INT2', 'INT4', 'INT8',
    'BIGINT', 'SMALLINT', 'TINYINT', 'MEDIUMINT',
    'REAL', 'FLOAT', 'FLOAT4', 'FLOAT8', 'DOUBLE',
    'NUMERIC', 'DECIMAL', 'NUMBER',
    'BOOLEAN', 'BOOL', 'BIT',
    'TEXT', 'VARCHAR', 'CHAR', 'NCHAR', 'NVARCHAR', 'CHARACTER', 'VARYING',
    'CLOB', 'BLOB', 'BYTEA', 'BINARY', 'VARBINARY',
    'DATETIME', 'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'INTERVAL',
    'JSON', 'JSONB', 'XML', 'UUID',
    'INET', 'CIDR', 'MACADDR',
    'SERIAL', 'BIGSERIAL', 'SMALLSERIAL',
    'MONEY', 'OID', 'PRECISION', 'ZONE', 'ARRAY', 'ENUM',
    'TSVECTOR', 'TSQUERY',
]);

// ─── Master token regex ────────────────────────────────────────
// Ordered by specificity (multi-char patterns before single-char).
const TOKEN_RE = new RegExp(
    [
        /--[^\n]*/.source,               // line comment
        /\/\*[\s\S]*?\*\//.source,       // block comment
        /'(?:''|[^'])*'/.source,         // single-quoted string  ('' escape)
        /"(?:[^"\\]|\\.)*"/.source,      // double-quoted identifier / string
        /`[^`]*`/.source,                // backtick identifier (MySQL)
        /\b\d+(?:\.\d+)?\b/.source,      // numeric literal
        /\b[A-Za-z_]\w*\b/.source,       // word (keyword / type / identifier)
        /::?/.source,                    // :: type cast or : bind param
        /[=<>!]{1,2}/.source,            // comparison / not-equal
        /[+\-*/%|&^~]/.source,           // arithmetic / bitwise
        /[()\[\]{},;.]/.source,          // punctuation
        /[\s\S]/.source,                 // anything else (one char)
    ].join('|'),
    'g',
);

// ─── Classify a raw token into a type ──────────────────────────
function classify(raw) {
    const first = raw[0];

    if (first === '-' || (first === '/' && raw[1] === '*')) return T_COMMENT;
    if (first === "'" || first === '"' || first === '`')    return T_STRING;
    if (first >= '0' && first <= '9')                       return T_NUMBER;

    if (/^[A-Za-z_]/.test(first)) {
        const upper = raw.toUpperCase();
        if (KEYWORDS.has(upper)) return T_KEYWORD;
        if (TYPES.has(upper))    return T_TYPE;
        return null; // plain identifier → no span
    }

    if (/^(?:::|[=<>!]{1,2}|[+\-*/%|&^~])$/.test(raw)) return T_OPERATOR;
    if (/^[()\[\]{},;.:]$/.test(raw))                    return T_PUNCT;

    return null; // whitespace and other single chars → plain text
}

// ─── HTML escaping (text nodes only, not in attributes) ────────
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Tokenize and return an array of { type, value } objects.
 * type is one of the T_* constants or null (plain text / whitespace).
 */
export function tokenize(sql) {
    TOKEN_RE.lastIndex = 0;
    const tokens = [];
    let m;
    while ((m = TOKEN_RE.exec(sql)) !== null) {
        tokens.push({ type: classify(m[0]), value: m[0] });
    }
    return tokens;
}

/**
 * Convert SQL source to safe HTML with <span class="hl-*"> tokens.
 * The trailing \n ensures the overlay mirrors the last line height.
 */
export function highlight(sql) {
    if (!sql) return '\n';
    TOKEN_RE.lastIndex = 0;
    let out = '';
    let m;
    while ((m = TOKEN_RE.exec(sql)) !== null) {
        const raw  = m[0];
        const type = classify(raw);
        const safe = esc(raw);
        out += type ? `<span class="hl-${type}">${safe}</span>` : safe;
    }
    return out + '\n';
}
