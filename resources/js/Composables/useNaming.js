/**
 * useNaming — identifier sanitization.
 *
 * SQL identifiers in this tool are restricted to: a-z A-Z 0-9 _
 * Anything else is collapsed to `_`, runs of `_` are collapsed,
 * and leading/trailing `_` are trimmed.
 *
 * Examples:
 *   "My Table 1"  -> "My_Table_1"
 *   "user-email!" -> "user_email"
 *   "  foo  bar"  -> "foo_bar"
 *   "__a__b__"    -> "a_b"
 *   ""            -> fallback
 */
export function sanitizeIdentifier(input, fallback = '_') {
    let s = String(input ?? '');
    s = s.replace(/[^A-Za-z0-9_]+/g, '_');
    s = s.replace(/_+/g, '_');
    s = s.replace(/^_+|_+$/g, '');
    return s.length ? s : fallback;
}

/**
 * Suffix-on-collision helper: returns `base` if free, else `base_2`, `base_3`, …
 */
export function uniqueName(base, taken) {
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
}
