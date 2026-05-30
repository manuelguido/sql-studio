<script setup>
/**
 * Playground — composes the four components.
 *
 * Layout:
 *   ┌─────────── PlaygroundChrome (Load · Save · Cancel · Download) ───────────┐
 *   │  SqlEditor   │            SchemaGraph                  │ TableInspector  │
 *   └──────────────┴─────────────────────────────────────────┴─────────────────┘
 *   Status bar
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Head } from '@inertiajs/vue3';
import PlaygroundChrome from '../../Components/PlaygroundChrome.vue';
import SqlEditor from '../../Components/SqlEditor.vue';
import SchemaGraph from '../../Components/SchemaGraph.vue';
import TableInspector from '../../Components/TableInspector.vue';
import { usePlayground } from '../../Composables/usePlayground.js';
import { useKeyboard } from '../../Composables/useKeyboard.js';

const { dbSchema, isDirty, save } = usePlayground();

// Mount global keyboard system: undo/redo, copy/paste, delete, esc.
useKeyboard();

// Resizable editor pane width (persisted in-memory only)
const editorWidth = ref(440);
const dragging = ref(false);

function startResize(e) {
	e.preventDefault();
	dragging.value = true;
	window.addEventListener('pointermove', onResize);
	window.addEventListener('pointerup', endResize, { once: true });
}

function onResize(e) {
	if (!dragging.value) return;
	const next = Math.max(280, Math.min(900, e.clientX));
	editorWidth.value = next;
}

function endResize() {
	dragging.value = false;
	window.removeEventListener('pointermove', onResize);
}

// Cmd/Ctrl+S → Save
function onKeydown(e) {
	if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
		e.preventDefault();
		if (isDirty.value) save();
	}
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));

const totalFKs = computed(() => dbSchema.value.tables.reduce((s, t) => s + t.foreignKeys.length, 0));
</script>

<template>
	<Head title="SQL Studio" />

	<main class="flex h-screen flex-col overflow-hidden">
		<PlaygroundChrome />

		<!-- Workspace: editor | graph | inspector -->
		<div class="flex min-h-0 flex-1">
			<!-- Editor pane (resizable) -->
			<div
				class="flex shrink-0 flex-col overflow-hidden border-r hairline p-3"
				:style="{ width: editorWidth + 'px' }"
			>
				<SqlEditor />
			</div>

			<!-- Resize handle -->
			<div
				class="w-px shrink-0 cursor-col-resize bg-[color:var(--color-line)] transition-colors hover:bg-[color:var(--color-accent)]/40"
				:class="dragging ? 'bg-[color:var(--color-accent)]' : ''"
				@pointerdown="startResize"
			></div>

			<!-- Graph pane (flex) -->
			<SchemaGraph />

			<!-- Inspector -->
			<TableInspector />
		</div>

		<!-- Status bar -->
		<footer
			class="flex h-6 shrink-0 items-center justify-between border-t hairline bg-[color:var(--color-chrome)] px-4 font-mono text-[10.5px] text-[color:var(--color-ink-3)]"
		>
			<div class="flex items-center gap-4">
				<span>{{ dbSchema.tables.length }} tables</span>
				<span>{{ totalFKs }} relations</span>
				<span v-if="dbSchema.errors.length" class="text-[color:var(--color-warn)]">
					{{ dbSchema.errors.length }} parse warning{{ dbSchema.errors.length > 1 ? 's' : '' }}
				</span>
			</div>
			<div class="flex items-center gap-4">
				<span><kbd class="kbd">⌘ S</kbd> save</span>
				<span>SQLite-compatible</span>
			</div>
		</footer>
	</main>
</template>
