<script setup>
import { ref } from 'vue';
import { usePlayground } from '../Composables/usePlayground.js';

const { rawSQL, dbSchema, isDirty, save, cancel, loadFromText, downloadAsFile, resetPositions } = usePlayground();

const fileInput = ref(null);

function triggerLoad() {
    fileInput.value?.click();
}

function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadFromText(String(reader.result ?? ''));
    reader.readAsText(file);
    // Allow re-uploading the same file
    e.target.value = '';
}

function confirmCancel() {
    if (!isDirty.value) return;
    if (window.confirm('Discard unsaved changes and revert to the last saved state?')) cancel();
}
</script>

<template>
    <header class="flex h-11 shrink-0 items-center justify-between border-b hairline bg-[color:var(--color-chrome)] px-4">
        <!-- Brand -->
        <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-[color:var(--color-accent)]"></span>
                <span class="font-mono text-[12px] font-medium tracking-tight text-[color:var(--color-ink)]">Query Lens</span>
            </div>
            <span class="h-3 w-px bg-[color:var(--color-line-strong)]"></span>
            <span class="label">SQL Playground</span>
        </div>

        <!-- Status pill -->
        <div class="flex items-center gap-3 font-mono text-[11px] text-[color:var(--color-ink-3)]">
            <span class="metric">{{ dbSchema.tables.length }} tables</span>
            <span class="h-3 w-px bg-[color:var(--color-line-strong)]"></span>
            <span class="metric">{{ rawSQL.length }} chars</span>
            <span class="h-3 w-px bg-[color:var(--color-line-strong)]"></span>
            <span class="flex items-center gap-1.5">
                <span
                    class="h-1.5 w-1.5 rounded-full"
                    :class="isDirty ? 'bg-[color:var(--color-warn)]' : 'bg-[color:var(--color-ok)]'"
                ></span>
                <span>{{ isDirty ? 'modified' : 'saved' }}</span>
            </span>
        </div>

        <!-- Action buttons -->
        <div class="flex items-center gap-1.5">
            <input
                ref="fileInput"
                type="file"
                accept=".sql,text/plain"
                class="hidden"
                @change="onFileChange"
            />

            <button
                @click="triggerLoad"
                class="focus-ring flex h-7 items-center rounded-sm border hairline-strong bg-[color:var(--color-surface)] px-3 font-mono text-[11px] text-[color:var(--color-ink-2)] transition-colors hover:bg-[color:var(--color-elev)] hover:text-[color:var(--color-ink)]"
            >
                Load…
            </button>

            <button
                @click="downloadAsFile()"
                class="focus-ring flex h-7 items-center rounded-sm border hairline-strong bg-[color:var(--color-surface)] px-3 font-mono text-[11px] text-[color:var(--color-ink-2)] transition-colors hover:bg-[color:var(--color-elev)] hover:text-[color:var(--color-ink)]"
            >
                Download
            </button>

            <span class="mx-1 h-4 w-px bg-[color:var(--color-line-strong)]"></span>

            <button
                @click="resetPositions"
                class="focus-ring flex h-7 items-center rounded-sm border hairline bg-transparent px-3 font-mono text-[11px] text-[color:var(--color-ink-3)] transition-colors hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-ink-2)]"
                title="Auto-arrange tables"
            >
                Arrange
            </button>

            <button
                @click="confirmCancel"
                :disabled="!isDirty"
                class="focus-ring flex h-7 items-center rounded-sm border hairline bg-transparent px-3 font-mono text-[11px] text-[color:var(--color-ink-3)] transition-colors hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-ink-2)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[color:var(--color-ink-3)]"
            >
                Cancel
            </button>

            <button
                @click="save"
                :disabled="!isDirty"
                class="focus-ring flex h-7 items-center rounded-sm border border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/15 px-3 font-mono text-[11px] font-medium text-[color:var(--color-accent)] transition-colors hover:bg-[color:var(--color-accent)]/25 disabled:cursor-default disabled:border-[color:var(--color-line-strong)] disabled:bg-transparent disabled:text-[color:var(--color-ink-4)]"
            >
                Save
            </button>
        </div>
    </header>
</template>
