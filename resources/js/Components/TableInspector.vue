<script setup>
import { computed } from 'vue';
import { usePlayground } from '../Composables/usePlayground.js';

const { dbSchema, selectedTable, selectTable } = usePlayground();

const incomingFKs = computed(() => {
    if (!selectedTable.value) return [];
    return dbSchema.value.tables
        .flatMap((t) => t.foreignKeys.map((fk) => ({ ...fk, fromTable: t.name })))
        .filter((fk) => fk.refTable === selectedTable.value.name);
});
</script>

<template>
    <aside class="flex w-[280px] shrink-0 flex-col overflow-auto border-l hairline bg-[color:var(--color-chrome)]">
        <!-- All tables list -->
        <section class="shrink-0">
            <div class="flex items-center justify-between border-b hairline px-4 py-2">
                <span class="label">Tables</span>
                <span class="metric font-mono text-[10.5px] text-[color:var(--color-ink-3)]">
                    {{ dbSchema.tables.length }}
                </span>
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
                No tables parsed.
            </p>
        </section>

        <!-- Detail of selected table -->
        <section v-if="selectedTable" class="border-t hairline">
            <div class="flex items-center justify-between border-b hairline px-4 py-2">
                <span class="label">Inspector</span>
                <button
                    @click="selectTable(null)"
                    class="font-mono text-[10px] text-[color:var(--color-ink-4)] transition-colors hover:text-[color:var(--color-ink-2)]"
                >clear</button>
            </div>

            <div class="px-4 py-3">
                <p class="font-mono text-[13px] font-semibold text-[color:var(--color-ink)]">
                    {{ selectedTable.name }}
                </p>
                <p class="mt-0.5 label">
                    {{ selectedTable.columns.length }} columns ·
                    {{ selectedTable.foreignKeys.length }} fk out ·
                    {{ incomingFKs.length }} fk in
                </p>
            </div>

            <!-- Columns -->
            <div class="border-t hairline px-4 py-2">
                <p class="label mb-1.5">Columns</p>
                <ul class="divide-y hairline">
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
                                v-else-if="selectedTable.foreignKeys.some((fk) => fk.column === col.name)"
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
            </div>

            <!-- Outgoing FKs -->
            <div v-if="selectedTable.foreignKeys.length" class="border-t hairline px-4 py-2">
                <p class="label mb-1.5">References</p>
                <ul class="space-y-0.5">
                    <li
                        v-for="fk in selectedTable.foreignKeys"
                        :key="`out_${fk.column}`"
                        class="font-mono text-[10.5px] text-[color:var(--color-ink-2)]"
                    >
                        <span class="text-[color:var(--color-accent)]">{{ fk.column }}</span>
                        <span class="mx-1 text-[color:var(--color-ink-4)]">→</span>
                        <button
                            @click="selectTable(fk.refTable)"
                            class="text-[color:var(--color-ink)] underline-offset-2 hover:underline"
                        >{{ fk.refTable }}.{{ fk.refColumn }}</button>
                    </li>
                </ul>
            </div>

            <!-- Incoming FKs -->
            <div v-if="incomingFKs.length" class="border-t hairline px-4 py-2">
                <p class="label mb-1.5">Referenced by</p>
                <ul class="space-y-0.5">
                    <li
                        v-for="fk in incomingFKs"
                        :key="`in_${fk.fromTable}_${fk.column}`"
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
        </section>

        <section v-else class="border-t hairline px-4 py-4">
            <p class="font-mono text-[11px] text-[color:var(--color-ink-4)] leading-relaxed">
                Select a table from the list or graph to inspect its structure.
            </p>
        </section>
    </aside>
</template>
