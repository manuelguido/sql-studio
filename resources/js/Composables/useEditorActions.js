const NEW_TABLE_SNIPPET = `CREATE TABLE new_table (
    id INTEGER PRIMARY KEY
);`;

function clampPosition(position, max) {
	const value = Number.isFinite(position) ? position : max;
	return Math.max(0, Math.min(max, value));
}

function normalizeSnippet(snippet) {
	return String(snippet ?? '')
		.trim()
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n');
}

function leadingBoundary(value, start) {
	const before = value.slice(0, start);

	if (!before.length || !before.trim().length) return '';
	if (before.endsWith('\n\n')) return '';
	if (before.endsWith('\n')) return '\n';

	return '\n\n';
}

function trailingBoundary(value, end) {
	const after = value.slice(end);

	if (!after.length || !after.trim().length) return '';
	if (after.startsWith('\n\n')) return '';
	if (after.startsWith('\n')) return '\n';

	return '\n\n';
}

export function prepareSnippetInsertion(value, selection, snippet, selectText = null) {
	const source = String(value ?? '');
	const max = source.length;
	const selectionStart = clampPosition(selection?.start, max);
	const selectionEnd = clampPosition(selection?.end, max);
	const start = Math.min(selectionStart, selectionEnd);
	const end = Math.max(selectionStart, selectionEnd);
	const body = normalizeSnippet(snippet);
	const prefix = leadingBoundary(source, start);
	const suffix = trailingBoundary(source, end);
	const text = `${prefix}${body}${suffix}`;
	const markerStart = selectText ? text.indexOf(selectText) : -1;
	const cursorStart = markerStart >= 0 ? markerStart : prefix.length + body.length;
	const cursorEnd = markerStart >= 0 ? markerStart + selectText.length : cursorStart;

	return {
		text,
		selectionStartOffset: cursorStart,
		selectionEndOffset: cursorEnd,
	};
}

export function createEditorActions(insertSnippet) {
	return [
		{
			id: 'new_table',
			label: 'New Table',
			icon: '+',
			handler: () =>
				insertSnippet({
					text: NEW_TABLE_SNIPPET,
					selectText: 'new_table',
				}),
		},
	];
}
