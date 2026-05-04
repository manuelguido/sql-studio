<script setup>
import { computed, ref } from 'vue';
import { Head } from '@inertiajs/vue3';
import { parse } from 'pgsql-ast-parser';

const props = defineProps({
    examples: Array,
    schema: Array,
});

const selectedExampleId = ref(props.examples[0]?.id);
const selectedNodeId = ref(props.examples[0]?.plan[0]?.id);
const search = ref('');

const selectedExample = computed(() => props.examples.find((e) => e.id === selectedExampleId.value) ?? props.examples[0]);
const selectedNode = computed(() => selectedExample.value.plan.find((n) => n.id === selectedNodeId.value) ?? selectedExample.value.plan[0]);

const parsed = computed(() => {
    try {
        const ast = parse(selectedExample.value.sql);
        return { ast: Array.isArray(ast) ? ast[0] : ast, error: null };
    } catch (error) {
        return { ast: null, error: error.message };
    }
});

function walkAst(node, callback) {
    if (!node || typeof node !== 'object') return;
    callback(node);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach((child) => walkAst(child, callback));
        else if (value && typeof value === 'object') walkAst(value, callback);
    }
}

const queryShape = computed(() => {
    if (!parsed.value.ast) {
        return { tables: [], joins: 0, columns: 0, hasWhere: false, hasGroup: false, hasOrder: false, hasWindow: false };
    }
    const tree = parsed.value.ast;
    const tables = new Set();
    let joins = 0;
    let hasWhere = false;
    let hasGroup = false;
    let hasOrder = false;

    walkAst(tree, (node) => {
        if (node.type === 'table' && node.name?.name) tables.add(node.name.name);
        if (node.join) joins += 1;
        hasWhere = hasWhere || Boolean(node.where);
        hasGroup = hasGroup || Boolean(node.groupBy);
        hasOrder = hasOrder || Boolean(node.orderBy);
    });

    const mainSelect = tree.type === 'with' ? tree.in : tree;

    return {
        tables: [...tables].filter((t) => props.schema.some((s) => s.table === t)),
        joins,
        columns: Array.isArray(mainSelect.columns) ? mainSelect.columns.length : 0,
        hasWhere,
        hasGroup,
        hasOrder,
        hasWindow: selectedExample.value.sql.toLowerCase().includes(' over '),
    };
});

const visibleSchema = computed(() => {
    const q = search.value.trim().toLowerCase();
    const active = new Set(queryShape.value.tables);
    return props.schema
        .filter((t) => active.has(t.table) || selectedExample.value.sql.includes(t.table))
        .filter((t) => !q || t.table.toLowerCase().includes(q));
});

const maxCost = computed(() => Math.max(...selectedExample.value.plan.map((n) => n.cost)));

function chooseExample(example) {
    selectedExampleId.value = example.id;
    selectedNodeId.value = example.plan[0]?.id;
}

function nodeKind(type) {
    return {
        scan: 'Sequential scan',
        index: 'Index scan',
        join: 'Join',
        aggregate: 'Aggregate',
        window: 'Window',
        sort: 'Sort',
        limit: 'Limit',
    }[type] ?? type;
}
</script>

<template>
    <Head title="QueryLens — SQL Query Visualizer" />

    <main class="flex min-h-screen flex-col">
        <!-- ============ TOP CHROME ============ -->
        <header class="flex h-11 shrink-0 items-center justify-between border-b hairline bg-[color:var(--color-chrome)] px-4">
            <div class="flex items-center gap-4">
                <div class="flex items-center gap-2">
                    <span class="h-2 w-2 rounded-full bg-[color:var(--color-accent)]"></span>
                    <span class="font-mono text-[12px] font-medium tracking-tight text-[color:var(--color-ink)]">QueryLens</span>
                </div>
                <span class="h-3 w-px bg-[color:var(--color-line-strong)]"></span>
                <span class="label">SQL Visualizer</span>
            </div>

            <div class="flex items-center gap-4 text-[11px] text-[color:var(--color-ink-3)]">
                <span class="font-mono">PostgreSQL</span>
                <span class="h-3 w-px bg-[color:var(--color-line-strong)]"></span>
                <span class="font-mono">pgsql-ast-parser</span>
                <span class="h-3 w-px bg-[color:var(--color-line-strong)]"></span>
                <span class="flex items-center gap-1.5">
                    <span class="h-1.5 w-1.5 rounded-full" :class="parsed.error ? 'bg-[color:var(--color-err)]' : 'bg-[color:var(--color-ok)]'"></span>
                    <span class="font-mono">{{ parsed.error ? 'parse error' : 'parsed' }}</span>
                </span>
            </div>
        </header>

        <!-- ============ TAB STRIP ============ -->
        <div class="flex h-9 shrink-0 items-stretch border-b hairline bg-[color:var(--color-chrome)]">
            <button
                v-for="example in examples"
                :key="example.id"
                @click="chooseExample(example)"
                class="group relative flex items-center gap-2 border-r hairline px-4 text-[12px] transition-colors"
                :class="selectedExampleId === example.id
                    ? 'bg-[color:var(--color-canvas)] text-[color:var(--color-ink)]'
                    : 'text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface)]/40'"
            >
                <span
                    v-if="selectedExampleId === example.id"
                    class="absolute inset-x-0 top-0 h-px bg-[color:var(--color-accent)]"
                ></span>
                <span class="font-mono">{{ example.name }}</span>
                <span class="metric font-mono text-[10px] text-[color:var(--color-ink-4)]">{{ example.latency }}</span>
            </button>
        </div>

        <!-- ============ WORKSPACE ============ -->
        <div class="grid flex-1 grid-cols-[1fr_320px] gap-0 overflow-hidden">

            <!-- ============ PRIMARY (editor + plan) ============ -->
            <div class="flex min-w-0 flex-col overflow-auto border-r hairline">

                <!-- SQL EDITOR — dominant -->
                <section class="flex flex-col p-6">
                    <div class="mb-3 flex items-baseline justify-between">
                        <div class="flex items-baseline gap-3">
                            <h2 class="text-[13px] font-semibold tracking-tight text-[color:var(--color-ink)]">{{ selectedExample.name }}</h2>
                            <span class="label">{{ selectedExample.dialect || 'postgres' }}</span>
                        </div>
                        <div class="flex items-center gap-4 font-mono text-[11px] text-[color:var(--color-ink-3)]">
                            <span class="metric">{{ selectedExample.latency }}</span>
                            <span class="metric">{{ selectedExample.rows }} rows</span>
                            <span>risk · {{ selectedExample.risk }}</span>
                        </div>
                    </div>

                    <div class="editor-surface overflow-hidden">
                        <div class="flex items-center justify-between border-b hairline px-3 py-1.5">
                            <div class="flex items-center gap-3">
                                <span class="label">query.sql</span>
                            </div>
                            <span class="font-mono text-[10px] text-[color:var(--color-ink-4)]">utf-8 · LF</span>
                        </div>
                        <pre class="sql-pre overflow-auto px-5 py-4"><code>{{ selectedExample.sql }}</code></pre>
                    </div>
                </section>

                <!-- EXECUTION PLAN -->
                <section class="flex flex-col px-6 pb-8">
                    <div class="mb-3 flex items-baseline justify-between">
                        <h2 class="text-[13px] font-semibold tracking-tight text-[color:var(--color-ink)]">Execution plan</h2>
                        <span class="label">{{ selectedExample.plan.length }} steps</span>
                    </div>

                    <div class="panel overflow-hidden">
                        <div class="panel-header">
                            <div class="flex items-center gap-3">
                                <span class="label">step</span>
                                <span class="label">operation</span>
                            </div>
                            <div class="flex items-center gap-6">
                                <span class="label">cost</span>
                                <span class="label">rows</span>
                            </div>
                        </div>

                        <ol>
                            <li
                                v-for="(node, i) in selectedExample.plan"
                                :key="node.id"
                                class="border-b last:border-b-0 hairline"
                            >
                                <button
                                    @click="selectedNodeId = node.id"
                                    class="grid w-full grid-cols-[2.25rem_1fr_8rem_4.5rem] items-center gap-4 px-3.5 py-2.5 text-left transition-colors row-hover focus-ring"
                                    :class="selectedNodeId === node.id ? 'bg-[color:var(--color-elev)]' : ''"
                                >
                                    <div class="flex items-center gap-2">
                                        <span
                                            class="h-3.5 w-0.5 rounded"
                                            :class="selectedNodeId === node.id ? 'bg-[color:var(--color-accent)]' : 'bg-transparent'"
                                        ></span>
                                        <span class="metric font-mono text-[11px] text-[color:var(--color-ink-3)]">
                                            {{ String(i + 1).padStart(2, '0') }}
                                        </span>
                                    </div>

                                    <div class="min-w-0">
                                        <div class="flex items-baseline gap-3">
                                            <span class="truncate text-[13px] font-medium text-[color:var(--color-ink)]">{{ node.label }}</span>
                                            <span class="font-mono text-[10px] uppercase tracking-wider text-[color:var(--color-ink-4)]">{{ nodeKind(node.type) }}</span>
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-2">
                                        <div class="h-1 flex-1 rounded-sm bg-[color:var(--color-line-strong)]">
                                            <div
                                                class="h-1 rounded-sm transition-all"
                                                :class="selectedNodeId === node.id ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-ink-3)]'"
                                                :style="{ width: `${(node.cost / maxCost) * 100}%` }"
                                            ></div>
                                        </div>
                                        <span class="metric font-mono text-[10.5px] text-[color:var(--color-ink-3)]">{{ node.cost }}</span>
                                    </div>

                                    <span class="metric text-right font-mono text-[11.5px] text-[color:var(--color-ink-2)]">
                                        {{ node.rows.toLocaleString() }}
                                    </span>
                                </button>
                            </li>
                        </ol>
                    </div>
                </section>
            </div>

            <!-- ============ SIDE PANELS (tertiary) ============ -->
            <aside class="flex min-w-0 flex-col gap-px overflow-auto bg-[color:var(--color-canvas)]">

                <!-- Selected node -->
                <section>
                    <div class="flex items-center justify-between px-4 py-2 bg-[color:var(--color-chrome)] border-b hairline">
                        <span class="label">Selected node</span>
                    </div>
                    <div class="px-4 py-3">
                        <div class="flex items-center gap-2">
                            <span class="h-1.5 w-1.5 rounded-full bg-[color:var(--color-accent)]"></span>
                            <span class="text-[12.5px] font-medium text-[color:var(--color-ink)]">{{ selectedNode.label }}</span>
                        </div>
                        <p class="mt-1 ml-3.5 font-mono text-[10.5px] uppercase tracking-wider text-[color:var(--color-ink-4)]">{{ nodeKind(selectedNode.type) }}</p>
                        <dl class="mt-3 grid grid-cols-2 gap-3 ml-3.5">
                            <div>
                                <dt class="label">cost</dt>
                                <dd class="metric mt-0.5 font-mono text-[13px] text-[color:var(--color-ink)]">{{ selectedNode.cost }}</dd>
                            </div>
                            <div>
                                <dt class="label">rows</dt>
                                <dd class="metric mt-0.5 font-mono text-[13px] text-[color:var(--color-ink)]">{{ selectedNode.rows.toLocaleString() }}</dd>
                            </div>
                        </dl>
                    </div>
                </section>

                <!-- Query shape -->
                <section>
                    <div class="flex items-center justify-between px-4 py-2 bg-[color:var(--color-chrome)] border-y hairline">
                        <span class="label">Query shape</span>
                    </div>
                    <dl class="px-4 py-1">
                        <div class="flex items-baseline justify-between border-b last:border-b-0 hairline py-1.5">
                            <dt class="text-[11.5px] text-[color:var(--color-ink-2)]">Tables</dt>
                            <dd class="metric font-mono text-[12px] text-[color:var(--color-ink)]">{{ queryShape.tables.length }}</dd>
                        </div>
                        <div class="flex items-baseline justify-between border-b last:border-b-0 hairline py-1.5">
                            <dt class="text-[11.5px] text-[color:var(--color-ink-2)]">Joins</dt>
                            <dd class="metric font-mono text-[12px] text-[color:var(--color-ink)]">{{ queryShape.joins }}</dd>
                        </div>
                        <div class="flex items-baseline justify-between border-b last:border-b-0 hairline py-1.5">
                            <dt class="text-[11.5px] text-[color:var(--color-ink-2)]">Columns</dt>
                            <dd class="metric font-mono text-[12px] text-[color:var(--color-ink)]">{{ queryShape.columns }}</dd>
                        </div>
                        <div class="flex items-baseline justify-between border-b last:border-b-0 hairline py-1.5">
                            <dt class="text-[11.5px] text-[color:var(--color-ink-2)]">Where</dt>
                            <dd class="font-mono text-[12px]" :class="queryShape.hasWhere ? 'text-[color:var(--color-ink)]' : 'text-[color:var(--color-ink-4)]'">{{ queryShape.hasWhere ? 'yes' : '—' }}</dd>
                        </div>
                        <div class="flex items-baseline justify-between border-b last:border-b-0 hairline py-1.5">
                            <dt class="text-[11.5px] text-[color:var(--color-ink-2)]">Group by</dt>
                            <dd class="font-mono text-[12px]" :class="queryShape.hasGroup ? 'text-[color:var(--color-ink)]' : 'text-[color:var(--color-ink-4)]'">{{ queryShape.hasGroup ? 'yes' : '—' }}</dd>
                        </div>
                        <div class="flex items-baseline justify-between border-b last:border-b-0 hairline py-1.5">
                            <dt class="text-[11.5px] text-[color:var(--color-ink-2)]">Order by</dt>
                            <dd class="font-mono text-[12px]" :class="queryShape.hasOrder ? 'text-[color:var(--color-ink)]' : 'text-[color:var(--color-ink-4)]'">{{ queryShape.hasOrder ? 'yes' : '—' }}</dd>
                        </div>
                        <div class="flex items-baseline justify-between py-1.5">
                            <dt class="text-[11.5px] text-[color:var(--color-ink-2)]">Window</dt>
                            <dd class="font-mono text-[12px]" :class="queryShape.hasWindow ? 'text-[color:var(--color-ink)]' : 'text-[color:var(--color-ink-4)]'">{{ queryShape.hasWindow ? 'yes' : '—' }}</dd>
                        </div>
                    </dl>
                </section>

                <!-- Tables -->
                <section class="flex-1">
                    <div class="flex items-center justify-between px-4 py-2 bg-[color:var(--color-chrome)] border-y hairline">
                        <span class="label">Tables in scope</span>
                        <span class="metric font-mono text-[10.5px] text-[color:var(--color-ink-3)]">{{ visibleSchema.length }}</span>
                    </div>
                    <div class="px-4 py-3">
                        <input
                            v-model="search"
                            type="text"
                            placeholder="Filter tables…"
                            class="focus-ring mb-2 h-7 w-full rounded-sm border hairline-strong bg-[color:var(--color-surface)] px-2 font-mono text-[11.5px] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)] focus:border-[color:var(--color-accent)]"
                        />
                        <ul class="divide-y hairline">
                            <li v-for="table in visibleSchema" :key="table.table" class="py-2">
                                <div class="flex items-baseline justify-between">
                                    <span class="font-mono text-[12px] text-[color:var(--color-ink)]">{{ table.table }}</span>
                                    <span class="metric font-mono text-[10.5px] text-[color:var(--color-ink-3)]">{{ table.rows }}</span>
                                </div>
                                <p class="mt-0.5 truncate font-mono text-[10.5px] text-[color:var(--color-ink-3)]">
                                    <span class="text-[color:var(--color-ink-4)]">idx </span>{{ table.indexes.join(' · ') }}
                                </p>
                            </li>
                            <li v-if="!visibleSchema.length" class="py-3">
                                <span class="text-[11.5px] text-[color:var(--color-ink-3)]">No tables match.</span>
                            </li>
                        </ul>
                    </div>
                </section>
            </aside>
        </div>

        <!-- ============ STATUS BAR ============ -->
        <footer class="flex h-6 shrink-0 items-center justify-between border-t hairline bg-[color:var(--color-chrome)] px-4 font-mono text-[10.5px] text-[color:var(--color-ink-3)]">
            <div class="flex items-center gap-4">
                <span>{{ selectedExample.plan.length }} ops</span>
                <span>{{ queryShape.tables.length }} tables</span>
                <span>{{ queryShape.joins }} joins</span>
            </div>
            <div class="flex items-center gap-4">
                <span class="metric">node {{ selectedNode.id }}</span>
                <span>UTF-8</span>
                <span>SQL</span>
            </div>
        </footer>
    </main>
</template>
