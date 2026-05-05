<script setup>
/**
 * SchemaGraph — visual schema editor.
 *
 * Always design-mode. Drag tables to reposition (8px grid snap).
 * Drag a column anchor onto another column to create a foreign key.
 * Click an edge to select the relation. Click empty canvas to clear.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { usePlayground } from '../Composables/usePlayground.js';
import { useSchemaEditor } from '../Composables/useSchemaEditor.js';
import { useHistory } from '../Composables/useHistory.js';

const {
    dbSchema,
    uiState,
    selectTable,
    selectRelation,
    setPosition,
} = usePlayground();

const { addForeignKey } = useSchemaEditor();
const { record } = useHistory();

// ── Layout constants ───────────────────────────────────────────
const NODE_WIDTH    = 240;
const NODE_GAP_X    = 80;
const NODE_GAP_Y    = 60;
const ROW_HEIGHT    = 28;
const HEADER_HEIGHT = 36;
const GRID_SNAP     = 8;
const GRID_CELL     = 24; // pixel size of grid background cell
const CANVAS_W      = 4000;
const CANVAS_H      = 3000;

function snap(v) {
    return Math.round(v / GRID_SNAP) * GRID_SNAP;
}

function defaultPosition(index, total) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(total || 1)));
    const col  = index % cols;
    const row  = Math.floor(index / cols);
    return {
        x: 40 + col * (NODE_WIDTH + NODE_GAP_X),
        y: 40 + row * (260 + NODE_GAP_Y),
    };
}

const positions = computed(() => {
    const map = {};
    dbSchema.value.tables.forEach((t, i) => {
        const stored = uiState.value.positions?.[t.name];
        map[t.name]  = stored ?? defaultPosition(i, dbSchema.value.tables.length);
    });
    return map;
});

// ── Node refs ──────────────────────────────────────────────────
const nodeRefs = {};
function setNodeRef(name, el) {
    if (el) nodeRefs[name] = el;
    else delete nodeRefs[name];
}

function columnRowY(colIndex) {
    return HEADER_HEIGHT + colIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
}

// ── Edges ──────────────────────────────────────────────────────
const edges = ref([]);

async function computeEdges() {
    await nextTick();
    const next = [];

    for (const table of dbSchema.value.tables) {
        const sourcePos = positions.value[table.name];
        if (!sourcePos) continue;
        const sw = nodeRefs[table.name]?.offsetWidth ?? NODE_WIDTH;

        for (const fk of table.foreignKeys) {
            const targetPos = positions.value[fk.refTable];
            if (!targetPos) continue;
            const targetTable = dbSchema.value.tables.find((t) => t.name === fk.refTable);
            if (!targetTable) continue;
            const tw = nodeRefs[fk.refTable]?.offsetWidth ?? NODE_WIDTH;

            const sIdx = table.columns.findIndex((c) => c.name === fk.column);
            const tIdx = targetTable.columns.findIndex((c) => c.name === fk.refColumn);
            const sy = sourcePos.y + columnRowY(sIdx >= 0 ? sIdx : 0);
            const ty = targetPos.y + columnRowY(tIdx >= 0 ? tIdx : 0);

            const goRight = sourcePos.x + sw / 2 < targetPos.x + tw / 2;
            const x1 = sourcePos.x + (goRight ? sw : 0);
            const x2 = targetPos.x + (goRight ? 0 : tw);
            const cx1 = x1 + (goRight ? 60 : -60);
            const cx2 = x2 + (goRight ? -60 : 60);

            next.push({
                key: `${table.name}.${fk.column}->${fk.refTable}.${fk.refColumn}`,
                from: table.name,
                to:   fk.refTable,
                column: fk.column,
                refColumn: fk.refColumn,
                d:    `M ${x1} ${sy} C ${cx1} ${sy} ${cx2} ${ty} ${x2} ${ty}`,
                x1, y1: sy, x2, y2: ty, goRight,
            });
        }
    }

    edges.value = next;
}

watch(() => dbSchema.value, () => computeEdges(), { deep: true });
watch(() => uiState.value.positions, () => computeEdges(), { deep: true });
onMounted(() => computeEdges());

// ── Table drag ─────────────────────────────────────────────────
const dragging = ref(null);

function startDrag(table, e) {
    if (e.button !== 0) return;
    e.preventDefault();
    selectTable(table.name);
    const pos = positions.value[table.name];
    // Record one history entry at drag-start so the whole drag is one undo step.
    record();
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
    const x = Math.max(0, snap(e.clientX - dragging.value.offsetX));
    const y = Math.max(0, snap(e.clientY - dragging.value.offsetY));
    setPosition(dragging.value.table, { x, y });
}

function endDrag() {
    dragging.value = null;
    window.removeEventListener('pointermove', onDrag);
}

onUnmounted(() => {
    window.removeEventListener('pointermove', onDrag);
    window.removeEventListener('pointermove', onConnectMove);
});

// ── FK connection drag ─────────────────────────────────────────
const canvasRef  = ref(null);
const connecting = ref(null);

function canvasPoint(e) {
    const root = canvasRef.value;
    if (!root) return { x: 0, y: 0 };
    const rect = root.getBoundingClientRect();
    return {
        x: e.clientX - rect.left + root.scrollLeft,
        y: e.clientY - rect.top  + root.scrollTop,
    };
}

function startConnect(table, column, e) {
    e.preventDefault();
    e.stopPropagation();
    const pos = positions.value[table.name];
    const colIdx = table.columns.findIndex((c) => c.name === column.name);
    const sw = nodeRefs[table.name]?.offsetWidth ?? NODE_WIDTH;
    const sx = pos.x + sw;
    const sy = pos.y + columnRowY(colIdx >= 0 ? colIdx : 0);
    const p  = canvasPoint(e);
    connecting.value = {
        fromTable:  table.name,
        fromColumn: column.name,
        sx, sy,
        mx: p.x, my: p.y,
        hover: null,
    };
    window.addEventListener('pointermove', onConnectMove);
    window.addEventListener('pointerup', endConnect, { once: true });
}

function onConnectMove(e) {
    if (!connecting.value) return;
    const p = canvasPoint(e);
    connecting.value = { ...connecting.value, mx: p.x, my: p.y };
}

function targetAnchor(table, column) {
    if (!connecting.value) return;
    if (connecting.value.fromTable === table.name && connecting.value.fromColumn === column.name) return;
    connecting.value = {
        ...connecting.value,
        hover: { table: table.name, column: column.name },
    };
}

function clearTargetAnchor() {
    if (!connecting.value) return;
    connecting.value = { ...connecting.value, hover: null };
}

function endConnect() {
    window.removeEventListener('pointermove', onConnectMove);
    const c = connecting.value;
    connecting.value = null;
    if (!c || !c.hover) return;
    addForeignKey({
        fromTable:  c.fromTable,
        fromColumn: c.fromColumn,
        toTable:    c.hover.table,
        toColumn:   c.hover.column,
    });
}

// ── Highlights ─────────────────────────────────────────────────
const selectedName = computed(() => uiState.value.selectedTable);
const selectedRel  = computed(() => uiState.value.selectedRelation);

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
    if (selectedRel.value
        && edge.from === selectedRel.value.from
        && edge.to === selectedRel.value.to
        && edge.column === selectedRel.value.column
        && edge.refColumn === selectedRel.value.refColumn) {
        return 'selected';
    }
    if (selectedName.value && (edge.from === selectedName.value || edge.to === selectedName.value)) {
        return 'related';
    }
    return null;
}

function pickRelation(edge, e) {
    e.stopPropagation();
    selectRelation({
        from: edge.from,
        to: edge.to,
        column: edge.column,
        refColumn: edge.refColumn,
    });
}

function clearSelection(e) {
    if (e.target === e.currentTarget || e.target.tagName === 'svg' || e.target.tagName === 'DIV') {
        selectTable(null);
    }
}

function isFKColumn(table, columnName) {
    return table.foreignKeys.some((fk) => fk.column === columnName);
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
                <p class="font-mono text-[12px] text-[color:var(--color-ink-3)]">No tables yet.</p>
                <p class="mt-1 font-mono text-[11px] text-[color:var(--color-ink-4)]">
                    Use <span class="text-[color:var(--color-ink-2)]">New Table</span>,
                    <span class="text-[color:var(--color-ink-2)]">Template</span>,
                    or paste SQL into the editor.
                </p>
            </div>
        </div>

        <!-- Canvas -->
        <div
            v-else
            ref="canvasRef"
            class="relative flex-1 overflow-auto"
            @click="clearSelection"
        >
            <!-- Inner canvas: grid is INSIDE so it pans with content -->
            <div
                class="canvas-inner relative"
                :style="{ width: CANVAS_W + 'px', height: CANVAS_H + 'px' }"
            >
                <!-- SVG edges layer -->
                <svg
                    class="absolute inset-0 h-full w-full overflow-visible"
                    :class="connecting ? 'pointer-events-none' : ''"
                    aria-hidden="true"
                >
                    <defs>
                        <marker
                            id="fk-arrow"
                            viewBox="0 0 8 8"
                            refX="6" refY="4"
                            markerWidth="6" markerHeight="6"
                            orient="auto-start-reverse"
                        >
                            <path d="M 0 0 L 8 4 L 0 8 z" fill="rgba(255,255,255,0.45)" />
                        </marker>
                        <marker
                            id="fk-arrow-active"
                            viewBox="0 0 8 8"
                            refX="6" refY="4"
                            markerWidth="6" markerHeight="6"
                            orient="auto-start-reverse"
                        >
                            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--color-accent)" />
                        </marker>
                    </defs>

                    <g v-for="edge in edges" :key="edge.key">
                        <path
                            :d="edge.d"
                            fill="none"
                            stroke="transparent"
                            stroke-width="14"
                            class="cursor-pointer"
                            style="pointer-events: stroke;"
                            @click.stop="pickRelation(edge, $event)"
                        />
                        <path
                            :d="edge.d"
                            fill="none"
                            :stroke="edgeActive(edge) ? 'var(--color-accent)' : 'rgba(255,255,255,0.32)'"
                            :stroke-width="edgeActive(edge) === 'selected' ? 1.75 : edgeActive(edge) === 'related' ? 1.5 : 1"
                            :stroke-opacity="edgeActive(edge) ? 1 : 0.7"
                            :marker-end="edgeActive(edge) ? 'url(#fk-arrow-active)' : 'url(#fk-arrow)'"
                            class="pointer-events-none"
                        />
                        <circle
                            :cx="edge.x1" :cy="edge.y1" r="3"
                            :fill="edgeActive(edge) ? 'var(--color-accent)' : 'var(--color-ink-3)'"
                            :fill-opacity="edgeActive(edge) ? 1 : 0.6"
                            class="pointer-events-none"
                        />
                    </g>

                    <!-- In-progress connection -->
                    <path
                        v-if="connecting"
                        :d="`M ${connecting.sx} ${connecting.sy} L ${connecting.mx} ${connecting.my}`"
                        fill="none"
                        stroke="var(--color-accent)"
                        stroke-width="1.5"
                        stroke-dasharray="3 3"
                        class="pointer-events-none"
                    />
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
                        class="flex cursor-grab items-center justify-between rounded-t-md border-b hairline px-3 active:cursor-grabbing"
                        :style="{ height: HEADER_HEIGHT + 'px' }"
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
                            class="group/row relative flex items-center justify-between gap-3 border-b last:border-b-0 hairline px-3"
                            :style="{ height: ROW_HEIGHT + 'px' }"
                            @pointerenter="targetAnchor(table, col)"
                            @pointerleave="clearTargetAnchor"
                        >
                            <div class="flex min-w-0 items-center gap-2">
                                <span
                                    v-if="col.pk"
                                    class="shrink-0 font-mono text-[9px] font-bold uppercase tracking-wider text-[color:var(--color-warn)]"
                                    title="Primary key"
                                >PK</span>
                                <span
                                    v-else-if="isFKColumn(table, col.name)"
                                    class="shrink-0 font-mono text-[9px] font-bold uppercase tracking-wider text-[color:var(--color-accent)]"
                                    title="Foreign key"
                                >FK</span>
                                <span
                                    v-else-if="col.unique"
                                    class="shrink-0 font-mono text-[9px] font-bold uppercase tracking-wider text-[color:var(--color-ink-3)]"
                                    title="Unique"
                                >U</span>
                                <span v-else class="w-[18px] shrink-0"></span>
                                <span class="truncate font-mono text-[11.5px] text-[color:var(--color-ink)]">
                                    {{ col.name }}
                                </span>
                            </div>
                            <span class="shrink-0 font-mono text-[10px] text-[color:var(--color-ink-3)]">
                                {{ col.type }}{{ col.nullable ? '' : ' *' }}
                            </span>

                            <!-- FK connection anchors -->
                            <button
                                type="button"
                                title="Drag to create a foreign key"
                                class="anchor anchor-left"
                                :class="connecting?.hover?.table === table.name && connecting?.hover?.column === col.name ? 'anchor--hot' : ''"
                                @pointerdown="startConnect(table, col, $event)"
                                @click.stop
                            ></button>
                            <button
                                type="button"
                                title="Drag to create a foreign key"
                                class="anchor anchor-right"
                                :class="connecting?.hover?.table === table.name && connecting?.hover?.column === col.name ? 'anchor--hot' : ''"
                                @pointerdown="startConnect(table, col, $event)"
                                @click.stop
                            ></button>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Grid lives INSIDE the sized canvas so it pans with the content. */
.canvas-inner {
    background-color: var(--color-canvas);
    background-image:
        linear-gradient(to right,  rgba(255,255,255,0.025) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px);
    background-size: 24px 24px;
    background-position: 0 0;
}

.anchor {
    position: absolute;
    top: 50%;
    width: 9px;
    height: 9px;
    margin-top: -4.5px;
    border-radius: 9999px;
    background: var(--color-canvas);
    border: 1px solid var(--color-line-strong);
    transition: background-color 120ms, border-color 120ms, transform 120ms;
    cursor: crosshair;
    opacity: 0;
}
.anchor-left  { left:  -5px; }
.anchor-right { right: -5px; }
li:hover .anchor,
.anchor--hot {
    opacity: 1;
}
.anchor:hover,
.anchor--hot {
    background: var(--color-accent);
    border-color: var(--color-accent);
    transform: scale(1.25);
}
</style>
