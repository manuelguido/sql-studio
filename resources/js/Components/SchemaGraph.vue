<script setup>
/**
 * SchemaGraph — pure renderer for `dbSchema`.
 * - Auto-layouts tables in a grid by default
 * - Drag-to-reposition (positions persisted via usePlayground.setPosition)
 * - Renders FK relationships as bezier connectors
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { usePlayground } from '../Composables/usePlayground.js';

const { dbSchema, uiState, selectTable, setPosition } = usePlayground();

// ── Layout ─────────────────────────────────────────────────────
const NODE_WIDTH    = 240;
const NODE_GAP_X    = 80;
const NODE_GAP_Y    = 60;
const NODE_BASE_H   = 40;        // header
const ROW_HEIGHT    = 24;        // per column

/** Default position for a table not yet placed by the user. */
function defaultPosition(index, total) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(total || 1)));
    const col  = index % cols;
    const row  = Math.floor(index / cols);
    return {
        x: 40 + col * (NODE_WIDTH + NODE_GAP_X),
        y: 40 + row * (260 + NODE_GAP_Y),
    };
}

/** Resolved positions for all tables (user-set or auto). */
const positions = computed(() => {
    const map = {};
    dbSchema.value.tables.forEach((t, i) => {
        const stored = uiState.value.positions?.[t.name];
        map[t.name]  = stored ?? defaultPosition(i, dbSchema.value.tables.length);
    });
    return map;
});

/** Node refs for edge geometry. */
const nodeRefs = {};
function setNodeRef(name, el) {
    if (el) nodeRefs[name] = el;
    else delete nodeRefs[name];
}

// ── Edges (recomputed on schema/position change) ───────────────
const edges = ref([]);

async function computeEdges() {
    await nextTick();
    const next = [];

    for (const table of dbSchema.value.tables) {
        for (const fk of table.foreignKeys) {
            const source = positions.value[table.name];
            const target = positions.value[fk.refTable];
            if (!source || !target) continue;

            const sourceEl = nodeRefs[table.name];
            const targetEl = nodeRefs[fk.refTable];
            const sw = sourceEl?.offsetWidth  ?? NODE_WIDTH;
            const sh = sourceEl?.offsetHeight ?? NODE_BASE_H + ROW_HEIGHT;
            const tw = targetEl?.offsetWidth  ?? NODE_WIDTH;
            const th = targetEl?.offsetHeight ?? NODE_BASE_H + ROW_HEIGHT;

            const goRight = source.x + sw / 2 < target.x + tw / 2;

            const x1 = source.x + (goRight ? sw : 0);
            const y1 = source.y + sh / 2;
            const x2 = target.x + (goRight ? 0 : tw);
            const y2 = target.y + th / 2;
            const cx = (x1 + x2) / 2;

            next.push({
                key: `${table.name}.${fk.column}→${fk.refTable}.${fk.refColumn}`,
                from: table.name,
                to:   fk.refTable,
                d:    `M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`,
                x1, y1, x2, y2,
            });
        }
    }

    edges.value = next;
}

watch(() => dbSchema.value, () => computeEdges(), { deep: true });
watch(() => uiState.value.positions, () => computeEdges(), { deep: true });
onMounted(() => computeEdges());

// ── Drag ───────────────────────────────────────────────────────
const dragging = ref(null); // { table, offsetX, offsetY }
const canvasRef = ref(null);

function startDrag(table, e) {
    e.preventDefault();
    selectTable(table.name);
    const pos = positions.value[table.name];
    dragging.value = {
        table:   table.name,
        offsetX: e.clientX - pos.x,
        offsetY: e.clientY - pos.y,
    };
    window.addEventListener('pointermove', onDrag);
    window.addEventListener('pointerup', endDrag, { once: true });
}

function onDrag(e) {
    if (!dragging.value) return;
    const x = Math.max(0, e.clientX - dragging.value.offsetX);
    const y = Math.max(0, e.clientY - dragging.value.offsetY);
    setPosition(dragging.value.table, { x, y });
}

function endDrag() {
    dragging.value = null;
    window.removeEventListener('pointermove', onDrag);
}

onUnmounted(() => window.removeEventListener('pointermove', onDrag));

// ── Highlights ─────────────────────────────────────────────────
const selectedName = computed(() => uiState.value.selectedTable);

function isRelated(tableName) {
    if (!selectedName.value) return false;
    if (tableName === selectedName.value) return false;
    const sel = dbSchema.value.tables.find((t) => t.name === selectedName.value);
    if (!sel) return false;
    if (sel.foreignKeys.some((fk) => fk.refTable === tableName)) return true;
    const me = dbSchema.value.tables.find((t) => t.name === tableName);
    return me?.foreignKeys.some((fk) => fk.refTable === selectedName.value) ?? false;
}

function edgeActive(edge) {
    return selectedName.value && (edge.from === selectedName.value || edge.to === selectedName.value);
}
</script>

<template>
    <div class="relative flex min-h-0 flex-1 overflow-hidden bg-[color:var(--color-canvas)]">
        <!-- Empty state -->
        <div
            v-if="!dbSchema.tables.length"
            class="flex flex-1 items-center justify-center"
        >
            <div class="text-center">
                <p class="font-mono text-[12px] text-[color:var(--color-ink-3)]">No tables to render.</p>
                <p class="mt-1 font-mono text-[11px] text-[color:var(--color-ink-4)]">
                    Add a <code class="text-[color:var(--color-ink-3)]">CREATE TABLE</code> statement on the left.
                </p>
            </div>
        </div>

        <!-- Canvas -->
        <div
            v-else
            ref="canvasRef"
            class="relative flex-1 overflow-auto"
        >
            <!-- Subtle grid background -->
            <div
                aria-hidden="true"
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px);
                    background-size: 24px 24px;
                "
            ></div>

            <!-- Inner canvas (large enough to hold any layout) -->
            <div class="relative" style="min-width: 2400px; min-height: 1600px;">
                <!-- SVG edges layer -->
                <svg
                    class="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                    aria-hidden="true"
                >
                    <path
                        v-for="edge in edges"
                        :key="edge.key"
                        :d="edge.d"
                        fill="none"
                        :stroke="edgeActive(edge) ? 'var(--color-accent)' : 'rgba(255,255,255,0.18)'"
                        :stroke-width="edgeActive(edge) ? 1.5 : 1"
                        :stroke-opacity="edgeActive(edge) ? 0.9 : 0.6"
                        stroke-dasharray="4 3"
                    />
                    <template v-for="edge in edges" :key="edge.key + '_dots'">
                        <circle
                            :cx="edge.x1" :cy="edge.y1" r="3"
                            :fill="edgeActive(edge) ? 'var(--color-accent)' : 'var(--color-ink-3)'"
                            :fill-opacity="edgeActive(edge) ? 1 : 0.5"
                        />
                        <circle
                            :cx="edge.x2" :cy="edge.y2" r="3"
                            :fill="edgeActive(edge) ? 'var(--color-accent)' : 'var(--color-ink-3)'"
                            :fill-opacity="edgeActive(edge) ? 1 : 0.5"
                        />
                    </template>
                </svg>

                <!-- Table nodes -->
                <div
                    v-for="table in dbSchema.tables"
                    :key="table.name"
                    :ref="(el) => setNodeRef(table.name, el)"
                    class="absolute select-none rounded-md border bg-[color:var(--color-surface)] transition-shadow"
                    :class="[
                        selectedName === table.name
                            ? 'border-[color:var(--color-accent)] shadow-[0_0_0_1px_var(--color-accent)]'
                            : isRelated(table.name)
                                ? 'border-[color:var(--color-accent)]/40'
                                : 'hairline-strong',
                        dragging?.table === table.name ? 'z-50' : 'z-10',
                    ]"
                    :style="{
                        width: NODE_WIDTH + 'px',
                        left:  positions[table.name].x + 'px',
                        top:   positions[table.name].y + 'px',
                    }"
                    @click.stop="selectTable(table.name)"
                >
                    <!-- Header (drag handle) -->
                    <div
                        class="flex cursor-grab items-center justify-between rounded-t-md border-b hairline px-3 py-2 active:cursor-grabbing"
                        :class="selectedName === table.name
                            ? 'bg-[color:var(--color-accent)]/15'
                            : 'bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent)]'"
                        @pointerdown="startDrag(table, $event)"
                    >
                        <span class="font-mono text-[12.5px] font-semibold text-[color:var(--color-ink)]">
                            {{ table.name }}
                        </span>
                        <span class="metric font-mono text-[10px] text-[color:var(--color-ink-3)]">
                            {{ table.columns.length }} cols
                        </span>
                    </div>

                    <!-- Columns -->
                    <ul>
                        <li
                            v-for="col in table.columns"
                            :key="col.name"
                            class="flex items-center justify-between gap-3 border-b last:border-b-0 hairline px-3 py-1.5"
                        >
                            <div class="flex min-w-0 items-center gap-2">
                                <span
                                    v-if="col.pk"
                                    class="shrink-0 font-mono text-[9px] font-bold uppercase tracking-wider text-[color:var(--color-warn)]"
                                >PK</span>
                                <span
                                    v-else-if="table.foreignKeys.some((fk) => fk.column === col.name)"
                                    class="shrink-0 font-mono text-[9px] font-bold uppercase tracking-wider text-[color:var(--color-accent)]"
                                >FK</span>
                                <span v-else class="w-[18px] shrink-0"></span>
                                <span class="truncate font-mono text-[11.5px] text-[color:var(--color-ink)]">
                                    {{ col.name }}
                                </span>
                            </div>
                            <span class="shrink-0 font-mono text-[10px] text-[color:var(--color-ink-3)]">
                                {{ col.type }}{{ col.nullable ? '' : ' *' }}
                            </span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
</template>
