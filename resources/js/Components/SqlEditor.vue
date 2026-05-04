<script setup>
import { computed, ref } from 'vue';
import { usePlayground } from '../Composables/usePlayground.js';

const { rawSQL, dbSchema } = usePlayground();
const editorRef = ref(null);

// Insert two spaces on Tab; Shift+Tab unindents.
function handleKeydown(e) {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const ta    = e.target;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const value = rawSQL.value;

    if (e.shiftKey) {
        // Unindent the start of the current line by up to 2 spaces
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const head      = value.slice(lineStart, lineStart + 2);
        if (head.startsWith('  ')) {
            rawSQL.value = value.slice(0, lineStart) + value.slice(lineStart + 2);
            queueMicrotask(() => { ta.selectionStart = ta.selectionEnd = Math.max(start - 2, lineStart); });
        }
        return;
    }

    rawSQL.value = value.slice(0, start) + '  ' + value.slice(end);
    queueMicrotask(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
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
                <span v-if="errorCount" class="font-mono text-[10px] text-[color:var(--color-warn)]">
                    {{ errorCount }} parse warning{{ errorCount > 1 ? 's' : '' }}
                </span>
            </div>
            <div class="flex items-center gap-3 font-mono text-[10px] text-[color:var(--color-ink-4)]">
                <span class="metric">{{ lineCount }} L</span>
                <span>UTF-8 · LF</span>
            </div>
        </div>

        <!-- Editor body -->
        <div class="relative flex min-h-0 flex-1 overflow-hidden">
            <!-- Gutter -->
            <div
                aria-hidden="true"
                class="select-none border-r hairline px-2 py-4 font-mono text-[11.5px] leading-[1.7] text-[color:var(--color-ink-4)]"
            >
                <div v-for="n in lineCount" :key="n" class="text-right tabular-nums">{{ n }}</div>
            </div>

            <textarea
                ref="editorRef"
                v-model="rawSQL"
                @keydown="handleKeydown"
                spellcheck="false"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                wrap="off"
                class="sql-pre flex-1 resize-none overflow-auto bg-transparent px-4 py-4 text-[color:var(--color-ink)] focus:outline-none"
            ></textarea>
        </div>
    </div>
</template>
