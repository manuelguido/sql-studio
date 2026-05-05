<script setup>
import { computed, ref, watch } from 'vue';
import { usePlayground } from '../Composables/usePlayground.js';
import { useSchemaEditor } from '../Composables/useSchemaEditor.js';

const {
    dbSchema,
    selectedTable,
    selectedRelation,
    mode,
    selectTable,
    selectRelation,
} = usePlayground();

const {
    addTable,
    removeTable,
    renameTable,
    addColumn,
    updateColumn,
    removeColumn,
    removeForeignKey,
} = useSchemaEditor();

const isDesign = computed(() => mode.value === 'design');

// ── Table-name editor (local buffer to avoid jitter while typing) ──
const nameBuffer = ref('');
watch(selectedTable, (t) => { nameBuffer.value = t?.name ?? ''; }, { immediate: true });

function commitName() {
    if (!selectedTable.value) return;
    const next = nameBuffer.value.trim();
    if (!next || next === selectedTable.value.name) {
        nameBuffer.value = selectedTable.value.name;
        return;
    }
    renameTable(selectedTable.value.name, next);
}

// ── Column buffers (rename on blur to avoid losing focus on every keystroke) ──
const colNameBuffers = ref({}); // keyed by current column name
watch(selectedTable, (t) => {
    colNameBuffers.value = {};
    if (!t) return;
    for (const c of t.columns) colNameBuffers.value[c.name] = c.name;
}, { immediate: true, deep: true });

function commitColumnName(columnName) {
    const t = selectedTable.value;
    if (!t) return;
    const next = (colNameBuffers.value[columnName] ?? '').trim();
    if (!next || next === columnName) {
        colNameBuffers.value[columnName] = columnName;
        return;
    }
    updateColumn(t.name, columnName, { name: next });
}

const TYPES = [
    'INTEGER', 'BIGINT', 'SMALLINT',
    'VARCHAR(255)', 'VARCHAR(120)', 'TEXT', 'CHAR(36)',
    'BOOLEAN',
    'TIMESTAMP', 'DATE', 'TIME',
    'NUMERIC(10,2)', 'REAL', 'DOUBLE',
    'JSON', 'JSONB', 'UUID',
];

function isFK(table, columnName) {
    return table.foreignKeys.some((fk) => fk.column === columnName);
}

const incomingFKs = computed(() => {
    if (!selectedTable.value) return [];
    return dbSchema.value.tables
        .flatMap((t) => t.foreignKeys.map((fk) => ({ ...fk, fromTable: t.name })))
        .filter((fk) => fk.refTable === selectedTable.value.name);
});

function deleteRelation() {
    if (!selectedRelation.value) return;
    removeForeignKey(selectedRelation.value);
}
</script>

<template>
    <aside class="flex w-[320px] shrink-0 flex-col overflow-auto border-l hairline bg-[color:var(--color-chrome)]">
        <!-- Tables list + add -->
        <section class="shrink-0">
            <div class="flex items-center justify-between border-b hairline px-4 py-2">
                <span class="label">Tables</span>
                <div class="flex items-center gap-2">
                    <span class="metric font-mono text-[10.5px] text-[color:var(--color-ink-3)]">
                        {{ dbSchema.tables.length }}
                    </span>
                    <button
                        v-if="isDesign"
                        @click="addTable()"
                        class="focus-ring flex h-5 items-center gap-0.5 rounded-sm border hairline-strong bg-[color:var(--color-surface)] px-1.5 font-mono text-[10px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-elev)] hover:text-[color:var(--color-ink)]"
                        title="Create a new table"
                    >+ new</button>
                </div>
            </div>
            <ul v-if="dbSchema.tables.length">
                <li
                    v-for="t in dbSchema.tables"
                    :key="t.name"
                    @click="selectTable(t.name)"
                    class="flex cursor-pointer items-baseline justify-between border-b last:border-b-0 hairline px-4 py-2 transition-colors"
                    :class="selectedTable?.name === t.name
                        ? 'bg-[color:var(--color-elev)]'
                        : 'hover:bg-[color:var(--color-surface)]/40'"
                >
                    <div class="flex items-center gap-2">
                        <span
                            class="h-1.5 w-1.5 rounded-full"
                            :class="selectedTable?.name === t.name ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-ink-4)]'"
                        ></span>
                        <span class="font-mono text-[12px] text-[color:var(--color-ink)]">{{ t.name }}</span>
                    </div>
                    <span class="metric font-mono text-[10.5px] text-[color:var(--color-ink-3)]">
                        {{ t.columns.length }}c
                    </span>
                </li>
            </ul>
            <p v-else class="px-4 py-4 font-mono text-[11px] text-[color:var(--color-ink-3)]">
                No tables yet.
            </p>
        </section>

        <!-- Relation inspector takes priority when a relation is selected -->
        <section v-if="selectedRelation" class="border-t hairline">
            <div class="flex items-center justify-between border-b hairline px-4 py-2">
                <span class="label">Relation</span>
                <button
                    @click="selectRelation(null)"
                    class="font-mono text-[10px] text-[color:var(--color-ink-4)] transition-colors hover:text-[color:var(--color-ink-2)]"
                >clear</button>
            </div>
            <div class="px-4 py-3 space-y-3">
                <div class="font-mono text-[12px] text-[color:var(--color-ink)] leading-relaxed">
                    <button
                        @click="selectTable(selectedRelation.from)"
                        class="text-[color:var(--color-accent)] hover:underline"
                    >{{ selectedRelation.from }}.{{ selectedRelation.column }}</button>
                    <span class="mx-1 text-[color:var(--color-ink-4)]">→</span>
                    <button
                        @click="selectTable(selectedRelation.to)"
                        class="hover:underline"
                    >{{ selectedRelation.to }}.{{ selectedRelation.refColumn }}</button>
                </div>
                <p class="font-mono text-[10.5px] text-[color:var(--color-ink-3)] leading-relaxed">
                    Foreign key constraint. References target column.
                </p>
                <button
                    v-if="isDesign"
                    @click="deleteRelation"
                    class="focus-ring flex h-7 w-full items-center justify-center rounded-sm border border-[color:var(--color-err)]/40 bg-[color:var(--color-err)]/10 px-3 font-mono text-[11px] text-[color:var(--color-err)] transition-colors hover:bg-[color:var(--color-err)]/20"
                >
                    Delete relation
                </button>
            </div>
        </section>

        <!-- Table inspector / editor -->
        <section v-else-if="selectedTable" class="border-t hairline">
            <div class="flex items-center justify-between border-b hairline px-4 py-2">
                <span class="label">{{ isDesign ? 'Editor' : 'Inspector' }}</span>
                <button
                    @click="selectTable(null)"
                    class="font-mono text-[10px] text-[color:var(--color-ink-4)] transition-colors hover:text-[color:var(--color-ink-2)]"
                >clear</button>
            </div>

            <div class="px-4 py-3 space-y-2">
                <!-- Editable name in design mode -->
                <input
                    v-if="isDesign"
                    v-model="nameBuffer"
                    @blur="commitName"
                    @keydown.enter.prevent="commitName"
                    class="ds-input font-mono text-[13px] font-semibold"
                    spellcheck="false"
                    autocapitalize="off"
                    autocomplete="off"
                />
                <p v-else class="font-mono text-[13px] font-semibold text-[color:var(--color-ink)]">
                    {{ selectedTable.name }}
                </p>
                <p class="label">
                    {{ selectedTable.columns.length }} columns ·
                    {{ selectedTable.foreignKeys.length }} fk out ·
                    {{ incomingFKs.length }} fk in
                </p>
            </div>

            <!-- Columns -->
            <div class="border-t hairline px-4 py-2">
                <div class="mb-1.5 flex items-center justify-between">
                    <span class="label">Columns</span>
                    <button
                        v-if="isDesign"
                        @click="addColumn(selectedTable.name)"
                        class="focus-ring flex h-5 items-center rounded-sm border hairline-strong bg-[color:var(--color-surface)] px-1.5 font-mono text-[10px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-elev)] hover:text-[color:var(--color-ink)]"
                    >+ column</button>
                </div>

                <!-- Read mode -->
                <ul v-if="!isDesign" class="divide-y hairline">
                    <li
                        v-for="col in selectedTable.columns"
                        :key="col.name"
                        class="flex items-baseline justify-between gap-2 py-1"
                    >
                        <div class="flex min-w-0 items-center gap-1.5">
                            <span
                                v-if="col.pk"
                                class="font-mono text-[8.5px] font-bold uppercase tracking-wider text-[color:var(--color-warn)]"
                            >PK</span>
                            <span
                                v-else-if="isFK(selectedTable, col.name)"
                                class="font-mono text-[8.5px] font-bold uppercase tracking-wider text-[color:var(--color-accent)]"
                            >FK</span>
                            <span class="truncate font-mono text-[11.5px] text-[color:var(--color-ink)]">{{ col.name }}</span>
                        </div>
                        <div class="flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-[color:var(--color-ink-3)]">
                            <span>{{ col.type }}</span>
                            <span v-if="!col.nullable" class="text-[color:var(--color-ink-2)]">NN</span>
                            <span v-if="col.unique" class="text-[color:var(--color-accent)]">U</span>
                        </div>
                    </li>
                </ul>

                <!-- Design mode editor -->
                <ul v-else class="space-y-2">
                    <li
                        v-for="col in selectedTable.columns"
                        :key="col.name"
                        class="rounded-sm border hairline bg-[color:var(--color-surface)]/40 p-2"
                    >
                        <div class="flex items-center gap-1.5">
                            <input
                                v-model="colNameBuffers[col.name]"
                                @blur="commitColumnName(col.name)"
                                @keydown.enter.prevent="commitColumnName(col.name)"
                                class="ds-input flex-1 font-mono text-[11.5px]"
                                spellcheck="false"
                                autocapitalize="off"
                                autocomplete="off"
                            />
                            <button
                                @click="removeColumn(selectedTable.name, col.name)"
                                class="focus-ring flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border hairline text-[color:var(--color-ink-3)] transition-colors hover:border-[color:var(--color-err)]/40 hover:bg-[color:var(--color-err)]/10 hover:text-[color:var(--color-err)]"
                                title="Remove column"
                            >×</button>
                        </div>

                        <div class="mt-1.5 grid grid-cols-2 gap-1.5">
                            <select
                                :value="col.type"
                                @change="updateColumn(selectedTable.name, col.name, { type: $event.target.value })"
                                class="ds-input font-mono text-[10.5px]"
                            >
                                <option v-if="!TYPES.includes(col.type)" :value="col.type">{{ col.type }}</option>
                                <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
                            </select>
                            <input
                                :value="col.default ?? ''"
                                placeholder="default"
                                @change="updateColumn(selectedTable.name, col.name, { default: $event.target.value })"
                                class="ds-input font-mono text-[10.5px]"
                                spellcheck="false"
                            />
                        </div>

                        <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-[color:var(--color-ink-3)]">
                            <label class="ds-check">
                                <input
                                    type="checkbox"
                                    :checked="col.pk"
                                    @change="updateColumn(selectedTable.name, col.name, { pk: $event.target.checked })"
                                />
                                <span :class="col.pk ? 'text-[color:var(--color-warn)]' : ''">PK</span>
                            </label>
                            <label class="ds-check">
                                <input
                                    type="checkbox"
                                    :checked="!col.nullable"
                                    @change="updateColumn(selectedTable.name, col.name, { nullable: !$event.target.checked })"
                                    :disabled="col.pk"
                                />
                                <span>NOT NULL</span>
                            </label>
                            <label class="ds-check">
                                <input
                                    type="checkbox"
                                    :checked="col.unique"
                                    @change="updateColumn(selectedTable.name, col.name, { unique: $event.target.checked })"
                                />
                                <span :class="col.unique ? 'text-[color:var(--color-accent)]' : ''">UNIQUE</span>
                            </label>
                        </div>
                    </li>
                </ul>
            </div>

            <!-- Outgoing FKs -->
            <div v-if="selectedTable.foreignKeys.length" class="border-t hairline px-4 py-2">
                <p class="label mb-1.5">References</p>
                <ul class="space-y-0.5">
                    <li
                        v-for="fk in selectedTable.foreignKeys"
                        :key="`out_${fk.column}_${fk.refTable}_${fk.refColumn}`"
                        class="flex items-center justify-between gap-2 font-mono text-[10.5px] text-[color:var(--color-ink-2)]"
                    >
                        <span class="truncate">
                            <span class="text-[color:var(--color-accent)]">{{ fk.column }}</span>
                            <span class="mx-1 text-[color:var(--color-ink-4)]">→</span>
                            <button
                                @click="selectTable(fk.refTable)"
                                class="text-[color:var(--color-ink)] underline-offset-2 hover:underline"
                            >{{ fk.refTable }}.{{ fk.refColumn }}</button>
                        </span>
                        <button
                            v-if="isDesign"
                            @click="removeForeignKey({ from: selectedTable.name, column: fk.column, to: fk.refTable, refColumn: fk.refColumn })"
                            class="shrink-0 font-mono text-[10px] text-[color:var(--color-ink-4)] transition-colors hover:text-[color:var(--color-err)]"
                            title="Remove relation"
                        >×</button>
                    </li>
                </ul>
            </div>

            <!-- Incoming FKs -->
            <div v-if="incomingFKs.length" class="border-t hairline px-4 py-2">
                <p class="label mb-1.5">Referenced by</p>
                <ul class="space-y-0.5">
                    <li
                        v-for="fk in incomingFKs"
                        :key="`in_${fk.fromTable}_${fk.column}_${fk.refColumn}`"
                        class="font-mono text-[10.5px] text-[color:var(--color-ink-2)]"
                    >
                        <button
                            @click="selectTable(fk.fromTable)"
                            class="text-[color:var(--color-ink)] underline-offset-2 hover:underline"
                        >{{ fk.fromTable }}.{{ fk.column }}</button>
                        <span class="mx-1 text-[color:var(--color-ink-4)]">→</span>
                        <span class="text-[color:var(--color-accent)]">{{ fk.refColumn }}</span>
                    </li>
                </ul>
            </div>

            <!-- Destructive zone (design only) -->
            <div v-if="isDesign" class="border-t hairline px-4 py-3">
                <button
                    @click="removeTable(selectedTable.name)"
                    class="focus-ring flex h-7 w-full items-center justify-center rounded-sm border border-[color:var(--color-err)]/40 bg-[color:var(--color-err)]/10 px-3 font-mono text-[11px] text-[color:var(--color-err)] transition-colors hover:bg-[color:var(--color-err)]/20"
                >
                    Drop table
                </button>
            </div>
        </section>

        <section v-else class="border-t hairline px-4 py-4">
            <p class="font-mono text-[11px] text-[color:var(--color-ink-4)] leading-relaxed">
                <template v-if="isDesign">
                    Select a table to edit it, or drag from a column anchor to create a foreign key.
                </template>
                <template v-else>
                    Select a table from the list or graph to inspect its structure.
                </template>
            </p>
        </section>
    </aside>
</template>

<style scoped>
.ds-input {
    width: 100%;
    background: var(--color-canvas);
    border: 1px solid var(--color-line-strong);
    border-radius: 3px;
    color: var(--color-ink);
    padding: 4px 8px;
    font-family: var(--font-mono);
    outline: none;
}
.ds-input:focus {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 1px var(--color-accent);
}
select.ds-input {
    cursor: pointer;
}
.ds-check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    user-select: none;
}
.ds-check input[type="checkbox"] {
    accent-color: var(--color-accent);
    cursor: pointer;
}
.ds-check input[type="checkbox"]:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}
</style>
