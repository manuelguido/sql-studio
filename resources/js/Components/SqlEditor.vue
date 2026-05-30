<script setup>
import { computed, nextTick, ref } from 'vue';
import { usePlayground } from '../Composables/usePlayground.js';
import { createEditorActions, prepareSnippetInsertion } from '../Composables/useEditorActions.js';
import { highlight } from '../Composables/useSqlHighlighter.js';

const { rawSQL, dbSchema } = usePlayground();
const editorRef = ref(null);
const highlightRef = ref(null);
const lastSelection = ref({
	start: rawSQL.value.length,
	end: rawSQL.value.length,
});

function updateLastSelection(editor = editorRef.value) {
	if (!editor) return;
	lastSelection.value = {
		start: editor.selectionStart,
		end: editor.selectionEnd,
	};
}

function getSelection() {
	const editor = editorRef.value;
	const max = rawSQL.value.length;

	if (editor && document.activeElement === editor) {
		return {
			start: editor.selectionStart,
			end: editor.selectionEnd,
		};
	}

	const start = Number.isFinite(lastSelection.value.start) ? lastSelection.value.start : max;
	const end = Number.isFinite(lastSelection.value.end) ? lastSelection.value.end : start;

	return {
		start: Math.max(0, Math.min(max, start)),
		end: Math.max(0, Math.min(max, end)),
	};
}

function emitInput(editor, data, inputType) {
	const event =
		typeof InputEvent === 'function'
			? new InputEvent('input', { data, inputType, bubbles: true })
			: new Event('input', { bubbles: true });

	editor.dispatchEvent(event);
}

function applyTextEdit({ start, end, text, selectionStart, selectionEnd, inputType = 'insertText' }) {
	const editor = editorRef.value;
	if (!editor) return;

	editor.focus({ preventScroll: true });
	editor.setSelectionRange(start, end);

	const previousValue = editor.value;
	let applied = false;

	if (typeof document.execCommand === 'function') {
		applied = text === '' ? document.execCommand('delete') : document.execCommand('insertText', false, text);
	}

	if (!applied && editor.value === previousValue) {
		editor.setRangeText(text, start, end, 'end');
		emitInput(editor, text, inputType);
	}

	const nextStart = selectionStart ?? start + text.length;
	const nextEnd = selectionEnd ?? nextStart;

	nextTick(() => {
		editor.setSelectionRange(nextStart, nextEnd);
		updateLastSelection(editor);
	});
}

function insertText(text, options = {}) {
	const selection = getSelection();

	applyTextEdit({
		start: selection.start,
		end: selection.end,
		text,
		selectionStart: selection.start + (options.selectionStartOffset ?? text.length),
		selectionEnd: selection.start + (options.selectionEndOffset ?? options.selectionStartOffset ?? text.length),
	});
}

function insertSnippet(snippet) {
	const insertion = prepareSnippetInsertion(rawSQL.value, getSelection(), snippet.text, snippet.selectText);

	insertText(insertion.text, {
		selectionStartOffset: insertion.selectionStartOffset,
		selectionEndOffset: insertion.selectionEndOffset,
	});
}

const editorActions = createEditorActions(insertSnippet);

// ─── Syntax highlighting ───────────────────────────────────────
const highlightedHTML = computed(() => highlight(rawSQL.value));

function syncScroll(e) {
	const hl = highlightRef.value;
	if (!hl) return;
	hl.scrollTop = e.target.scrollTop;
	hl.scrollLeft = e.target.scrollLeft;
}

// ─── Line / error counts ──────────────────────────────────────
function handleKeydown(e) {
	if (e.key !== 'Tab') return;
	e.preventDefault();
	const editor = e.target;
	const start = editor.selectionStart;
	const end = editor.selectionEnd;
	const value = rawSQL.value;

	if (e.shiftKey) {
		const lineStart = value.lastIndexOf('\n', start - 1) + 1;
		const head = value.slice(lineStart, lineStart + 2);
		if (head.startsWith('  ')) {
			applyTextEdit({
				start: lineStart,
				end: lineStart + 2,
				text: '',
				selectionStart: Math.max(start - 2, lineStart),
				selectionEnd: Math.max(end - 2, lineStart),
				inputType: 'deleteContentBackward',
			});
		}
		return;
	}

	applyTextEdit({
		start,
		end,
		text: '  ',
		selectionStart: start + 2,
		selectionEnd: start + 2,
	});
}

const lineCount = computed(() => rawSQL.value.split('\n').length);
const errorCount = computed(() => dbSchema.value.errors.length);
</script>

<template>
	<div class="editor-surface flex min-h-0 flex-1 flex-col">
		<!-- File-tab style header -->
		<div class="flex shrink-0 items-center justify-between border-b hairline px-3 py-1.5">
			<div class="flex items-center gap-3">
				<span class="label">schema.sql</span>
				<div class="flex items-center gap-1">
					<button
						v-for="action in editorActions"
						:key="action.id"
						type="button"
						class="focus-ring flex h-6 items-center gap-1 rounded-sm border hairline bg-transparent px-2 font-mono text-[10.5px] text-ink transition-colors hover:bg-surface hover:text-ink cursor-pointer"
						@mousedown.prevent
						@click="action.handler"
					>
						<span aria-hidden="true" class="text-[12px] leading-none">{{ action.icon }}</span>
						<span>{{ action.label }}</span>
					</button>
				</div>
				<span v-if="errorCount" class="font-mono text-[10px] text-warn">
					{{ errorCount }} parse warning{{ errorCount > 1 ? 's' : '' }}
				</span>
			</div>
			<div class="flex items-center gap-3 font-mono text-[10px] text-ink-4">
				<span class="metric">{{ lineCount }} L</span>
				<span>UTF-8 · LF</span>
			</div>
		</div>

		<!-- Editor body -->
		<div class="relative flex min-h-0 flex-1 overflow-hidden">
			<!-- Gutter -->
			<div
				aria-hidden="true"
				class="select-none border-r hairline px-2 py-4 font-mono text-[11.5px] leading-[1.7] text-ink-4"
			>
				<div v-for="n in lineCount" :key="n" class="text-right tabular-nums">
					{{ n }}
				</div>
			</div>

			<!-- Highlight overlay + textarea wrapper -->
			<div class="relative flex-1 overflow-hidden">
				<!-- Rendered highlight layer (behind textarea) -->
				<div ref="highlightRef" aria-hidden="true" class="hl-layer sql-pre" v-html="highlightedHTML"></div>

				<!-- Editing surface (transparent text → shows layer below) -->
				<textarea
					ref="editorRef"
					v-model="rawSQL"
					spellcheck="false"
					autocomplete="off"
					autocorrect="off"
					autocapitalize="off"
					wrap="off"
					@keydown="handleKeydown"
					class="sql-pre sql-textarea absolute inset-0 resize-none overflow-auto bg-transparent px-4 py-4 focus:outline-none"
					@click="updateLastSelection"
					@input="updateLastSelection"
					@keyup="updateLastSelection"
					@select="updateLastSelection"
					@scroll="syncScroll"
				></textarea>
			</div>
		</div>
	</div>
</template>
