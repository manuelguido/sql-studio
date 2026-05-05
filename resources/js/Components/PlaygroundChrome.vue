<script setup>
import { ref } from 'vue';
import { usePlayground } from '../Composables/usePlayground.js';
import { useSchemaEditor } from '../Composables/useSchemaEditor.js';
import { useHistory } from '../Composables/useHistory.js';
import ConfirmModal from './ConfirmModal.vue';

const {
    rawSQL,
    dbSchema,
    isDirty,
    save,
    cancel,
    loadFromText,
    loadDefaultTemplate,
    downloadAsFile,
    autoLayout,
} = usePlayground();

const { addTable } = useSchemaEditor();
const { undo, redo, canUndo, canRedo, clear: clearHistory } = useHistory();

const fileInput = ref(null);
const showCancelModal   = ref(false);
const showTemplateModal = ref(false);

function triggerLoad() {
    fileInput.value?.click();
}

function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        loadFromText(String(reader.result ?? ''));
        clearHistory();
    };
    reader.readAsText(file);
    e.target.value = '';
}

function requestCancel() {
    if (!isDirty.value) return;
    showCancelModal.value = true;
}

function performCancel() {
    cancel();
}

function requestTemplate() {
    if (dbSchema.value.tables.length > 0) {
        showTemplateModal.value = true;
    } else {
        loadDefaultTemplate();
        clearHistory();
    }
}

function performLoadTemplate() {
    loadDefaultTemplate();
    clearHistory();
}
</script>

<template>
    <header class="flex h-11 shrink-0 items-center justify-between border-b hairline bg-[color:var(--color-chrome)] px-4">
        <!-- Brand -->
        <div class="flex items-center gap-3">
            <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-[color:var(--color-accent)]"></span>
                <span class="font-mono text-[12px] font-medium tracking-tight text-[color:var(--color-ink)]">SQL Studio</span>
            </div>
            <span class="h-3 w-px bg-[color:var(--color-line-strong)]"></span>
            <span class="font-mono text-[10.5px] uppercase tracking-wider text-[color:var(--color-ink-3)]">Schema Designer</span>
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
                @click="addTable()"
                class="focus-ring flex h-7 items-center gap-1 rounded-sm border hairline-strong bg-[color:var(--color-surface)] px-3 font-mono text-[11px] text-[color:var(--color-ink-2)] transition-colors hover:bg-[color:var(--color-elev)] hover:text-[color:var(--color-ink)]"
                title="Create a new table"
            >
                <span aria-hidden="true" class="text-[12px] leading-none">+</span>
                <span>New Table</span>
            </button>
            <button
                @click="autoLayout"
                class="focus-ring flex h-7 items-center rounded-sm border hairline bg-transparent px-3 font-mono text-[11px] text-[color:var(--color-ink-3)] transition-colors hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-ink-2)]"
                title="Auto-arrange tables by dependency"
            >
                Auto Layout
            </button>
            <button
                @click="requestTemplate"
                class="focus-ring flex h-7 items-center rounded-sm border hairline bg-transparent px-3 font-mono text-[11px] text-[color:var(--color-ink-3)] transition-colors hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-ink-2)]"
                title="Load default template (users, projects, tasks, comments)"
            >
                Template
            </button>

            <span class="mx-1 h-4 w-px bg-[color:var(--color-line-strong)]"></span>

            <!-- Undo / Redo -->
            <button
                @click="undo"
                :disabled="!canUndo"
                class="focus-ring flex h-7 w-7 items-center justify-center rounded-sm border hairline bg-transparent font-mono text-[12px] text-[color:var(--color-ink-3)] transition-colors hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-ink)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[color:var(--color-ink-3)]"
                title="Undo (⌘Z)"
                aria-label="Undo"
            >↶</button>
            <button
                @click="redo"
                :disabled="!canRedo"
                class="focus-ring flex h-7 w-7 items-center justify-center rounded-sm border hairline bg-transparent font-mono text-[12px] text-[color:var(--color-ink-3)] transition-colors hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-ink)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[color:var(--color-ink-3)]"
                title="Redo (⇧⌘Z)"
                aria-label="Redo"
            >↷</button>

            <span class="mx-1 h-4 w-px bg-[color:var(--color-line-strong)]"></span>

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
                @click="requestCancel"
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

        <!-- Modals -->
        <ConfirmModal
            v-model:open="showTemplateModal"
            title="Load default template"
            message="Loading the template will replace your current schema."
            confirm-label="Load template"
            cancel-label="Cancel"
            @confirm="performLoadTemplate"
        />
        <ConfirmModal
            v-model:open="showCancelModal"
            title="Discard changes"
            message="Discard unsaved changes and revert to the last saved state?"
            confirm-label="Discard"
            cancel-label="Keep editing"
            variant="danger"
            @confirm="performCancel"
        />
    </header>
</template>
