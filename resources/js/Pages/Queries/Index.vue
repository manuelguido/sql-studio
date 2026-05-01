<script setup>
import { computed, ref } from 'vue';
import { Head } from '@inertiajs/vue3';
import { parse } from 'pgsql-ast-parser';
import { Blocks, Braces, Cable, CircleAlert, Clock3, Database, Filter, GitBranch, Rows3, Search, Sigma, Table2, Waypoints } from 'lucide-vue-next';

const props = defineProps({
    examples: Array,
    schema: Array,
});

const selectedExampleId = ref(props.examples[0]?.id);
const selectedNodeId = ref(props.examples[0]?.plan[0]?.id);
const search = ref('');

const selectedExample = computed(() => props.examples.find((example) => example.id === selectedExampleId.value) ?? props.examples[0]);
const selectedNode = computed(() => selectedExample.value.plan.find((node) => node.id === selectedNodeId.value) ?? selectedExample.value.plan[0]);

const parsed = computed(() => {
    try {
        const ast = parse(selectedExample.value.sql);

        return { ast: Array.isArray(ast) ? ast[0] : ast, error: null };
    } catch (error) {
        return { ast: null, error: error.message };
    }
});

function walkAst(node, callback) {
    if (!node || typeof node !== 'object') {
        return;
    }

    callback(node);

    for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
            value.forEach((child) => walkAst(child, callback));
        } else if (value && typeof value === 'object') {
            walkAst(value, callback);
        }
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
        if (node.type === 'table' && node.name?.name) {
            tables.add(node.name.name);
        }

        if (node.join) {
            joins += 1;
        }

        hasWhere = hasWhere || Boolean(node.where);
        hasGroup = hasGroup || Boolean(node.groupBy);
        hasOrder = hasOrder || Boolean(node.orderBy);
    });

    const mainSelect = tree.type === 'with' ? tree.in : tree;

    return {
        tables: [...tables].filter((table) => props.schema.some((schemaTable) => schemaTable.table === table)),
        joins,
        columns: Array.isArray(mainSelect.columns) ? mainSelect.columns.length : 0,
        hasWhere,
        hasGroup,
        hasOrder,
        hasWindow: selectedExample.value.sql.toLowerCase().includes(' over '),
    };
});

const visibleSchema = computed(() => {
    const normalizedSearch = search.value.trim().toLowerCase();
    const activeTables = new Set(queryShape.value.tables);

    return props.schema
        .filter((table) => activeTables.has(table.table) || selectedExample.value.sql.includes(table.table))
        .filter((table) => !normalizedSearch || table.table.toLowerCase().includes(normalizedSearch));
});

const maxCost = computed(() => Math.max(...selectedExample.value.plan.map((node) => node.cost)));

function chooseExample(example) {
    selectedExampleId.value = example.id;
    selectedNodeId.value = example.plan[0]?.id;
}

function nodeTone(type) {
    return {
        scan: 'border-sky-400/40 bg-sky-400/10 text-sky-200',
        index: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
        join: 'border-violet-400/40 bg-violet-400/10 text-violet-200',
        aggregate: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
        window: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200',
        sort: 'border-orange-400/40 bg-orange-400/10 text-orange-200',
        limit: 'border-lime-400/40 bg-lime-400/10 text-lime-200',
    }[type] ?? 'border-slate-400/40 bg-slate-400/10 text-slate-200';
}
</script>

<template>
    <Head title="SQL Query Visualizer" />

    <main class="min-h-screen bg-[#080a0f] text-slate-100">
        <div class="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(180deg,#101624,#080a0f)]">
            <div class="absolute inset-0 bg-[linear-gradient(rgba(45,212,191,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(129,140,248,0.055)_1px,transparent_1px)] bg-[size:32px_32px]" />
        </div>

        <section class="mx-auto grid min-h-screen max-w-[1560px] grid-rows-[auto_1fr] px-5 py-5 sm:px-8 lg:px-10">
            <header class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
                <div class="flex items-center gap-3">
                    <div class="flex h-9 w-9 items-center justify-center rounded-lg border border-teal-300/25 bg-teal-300/10 text-teal-200">
                        <Waypoints class="h-5 w-5" />
                    </div>
                    <div>
                        <p class="text-xs font-medium uppercase text-teal-200">QueryLens</p>
                        <h1 class="text-lg font-semibold tracking-tight text-white">SQL Query Visualizer</h1>
                    </div>
                </div>

                <div class="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs font-medium text-slate-300">
                    <Braces class="h-4 w-4 text-indigo-200" />
                    pgsql-ast-parser · PostgreSQL dialect
                </div>
            </header>

            <div class="grid gap-5 py-5 xl:grid-cols-[330px_1fr_360px]">
                <aside class="space-y-4">
                    <section class="rounded-lg border border-slate-800 bg-slate-950/80 p-4 shadow-xl shadow-black/25">
                        <div class="mb-3 flex items-center justify-between">
                            <h2 class="text-sm font-semibold text-white">Examples</h2>
                            <Blocks class="h-4 w-4 text-teal-200" />
                        </div>
                        <div class="space-y-2">
                            <button v-for="example in examples" :key="example.id" class="w-full rounded-lg border p-3 text-left transition" :class="selectedExampleId === example.id ? 'border-teal-300/40 bg-teal-300/10' : 'border-slate-800 bg-slate-900/55 hover:border-slate-600'" @click="chooseExample(example)">
                                <div class="flex items-center justify-between gap-3">
                                    <span class="text-sm font-semibold text-white">{{ example.name }}</span>
                                    <span class="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300">{{ example.risk }}</span>
                                </div>
                                <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                                    <span>{{ example.latency }}</span>
                                    <span>{{ example.rows }} rows</span>
                                </div>
                            </button>
                        </div>
                    </section>

                    <section class="rounded-lg border border-slate-800 bg-slate-950/80 p-4 shadow-xl shadow-black/25">
                        <div class="mb-3 flex items-center justify-between">
                            <h2 class="text-sm font-semibold text-white">Query shape</h2>
                            <GitBranch class="h-4 w-4 text-indigo-200" />
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div class="rounded-lg border border-slate-800 bg-slate-900/55 p-3">
                                <p class="text-xs text-slate-500">Tables</p>
                                <p class="mt-1 text-2xl font-semibold text-white">{{ queryShape.tables.length }}</p>
                            </div>
                            <div class="rounded-lg border border-slate-800 bg-slate-900/55 p-3">
                                <p class="text-xs text-slate-500">Joins</p>
                                <p class="mt-1 text-2xl font-semibold text-white">{{ queryShape.joins }}</p>
                            </div>
                            <div class="rounded-lg border border-slate-800 bg-slate-900/55 p-3">
                                <p class="text-xs text-slate-500">Columns</p>
                                <p class="mt-1 text-2xl font-semibold text-white">{{ queryShape.columns }}</p>
                            </div>
                            <div class="rounded-lg border border-slate-800 bg-slate-900/55 p-3">
                                <p class="text-xs text-slate-500">Window</p>
                                <p class="mt-1 text-2xl font-semibold text-white">{{ queryShape.hasWindow ? 'Yes' : 'No' }}</p>
                            </div>
                        </div>
                    </section>
                </aside>

                <section class="space-y-5">
                    <section class="rounded-lg border border-slate-800 bg-slate-950/80 p-4 shadow-2xl shadow-black/30">
                        <div class="mb-3 flex items-center justify-between">
                            <h2 class="text-sm font-semibold text-white">SQL</h2>
                            <Database class="h-4 w-4 text-teal-200" />
                        </div>
                        <pre class="max-h-[330px] overflow-auto rounded-lg border border-slate-800 bg-[#080d14] p-4 font-mono text-xs leading-6 text-slate-200"><code>{{ selectedExample.sql }}</code></pre>
                    </section>

                    <section class="rounded-lg border border-slate-800 bg-slate-950/80 p-4 shadow-2xl shadow-black/30">
                        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 class="text-sm font-semibold text-white">Execution plan</h2>
                                <p class="mt-1 text-xs text-slate-500">{{ selectedExample.latency }} · {{ selectedExample.rows }} estimated rows</p>
                            </div>
                            <div class="flex items-center gap-2 text-xs text-slate-400">
                                <Clock3 class="h-4 w-4 text-teal-200" />
                                {{ selectedNode.label }} · cost {{ selectedNode.cost }}
                            </div>
                        </div>

                        <div class="grid gap-3 md:grid-cols-5">
                            <button v-for="node in selectedExample.plan" :key="node.id" class="rounded-lg border p-4 text-left transition" :class="selectedNodeId === node.id ? nodeTone(node.type) : 'border-slate-800 bg-slate-900/50 text-slate-300 hover:border-slate-600'" @click="selectedNodeId = node.id">
                                <div class="flex h-10 items-center justify-between gap-2">
                                    <Sigma v-if="node.type === 'aggregate'" class="h-4 w-4" />
                                    <Cable v-else-if="node.type === 'join'" class="h-4 w-4" />
                                    <Table2 v-else-if="node.type === 'scan' || node.type === 'index'" class="h-4 w-4" />
                                    <Filter v-else class="h-4 w-4" />
                                    <span class="font-mono text-xs">{{ node.rows.toLocaleString() }}</span>
                                </div>
                                <p class="mt-3 min-h-10 text-sm font-semibold">{{ node.label }}</p>
                                <div class="mt-4 h-2 rounded-full bg-slate-800">
                                    <div class="h-full rounded-full bg-current" :style="{ width: `${(node.cost / maxCost) * 100}%` }" />
                                </div>
                            </button>
                        </div>
                    </section>
                </section>

                <aside class="space-y-5">
                    <section class="rounded-lg border border-slate-800 bg-slate-950/80 p-4 shadow-xl shadow-black/25">
                        <div class="mb-3 flex items-center justify-between">
                            <h2 class="text-sm font-semibold text-white">Parser state</h2>
                            <CircleAlert class="h-4 w-4" :class="parsed.error ? 'text-rose-300' : 'text-teal-200'" />
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div class="rounded-lg border border-slate-800 bg-slate-900/55 p-3">
                                <p class="text-xs text-slate-500">AST</p>
                                <p class="mt-1 text-lg font-semibold" :class="parsed.error ? 'text-rose-200' : 'text-teal-100'">{{ parsed.error ? 'Error' : 'Parsed' }}</p>
                            </div>
                            <div class="rounded-lg border border-slate-800 bg-slate-900/55 p-3">
                                <p class="text-xs text-slate-500">Dialect</p>
                                <p class="mt-1 text-lg font-semibold text-white">{{ selectedExample.dialect }}</p>
                            </div>
                            <div class="rounded-lg border border-slate-800 bg-slate-900/55 p-3">
                                <p class="text-xs text-slate-500">WHERE</p>
                                <p class="mt-1 text-lg font-semibold text-white">{{ queryShape.hasWhere ? 'Yes' : 'No' }}</p>
                            </div>
                            <div class="rounded-lg border border-slate-800 bg-slate-900/55 p-3">
                                <p class="text-xs text-slate-500">ORDER</p>
                                <p class="mt-1 text-lg font-semibold text-white">{{ queryShape.hasOrder ? 'Yes' : 'No' }}</p>
                            </div>
                        </div>
                    </section>

                    <section class="rounded-lg border border-slate-800 bg-slate-950/80 p-4 shadow-xl shadow-black/25">
                        <div class="mb-3 flex items-center justify-between">
                            <h2 class="text-sm font-semibold text-white">Tables</h2>
                            <Rows3 class="h-4 w-4 text-indigo-200" />
                        </div>
                        <div class="relative mb-3">
                            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                            <input v-model="search" class="h-10 w-full rounded-lg border border-slate-700 bg-slate-900/70 pl-10 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-teal-300 focus:ring-2 focus:ring-teal-300/20" placeholder="Filter tables">
                        </div>
                        <div class="space-y-2">
                            <div v-for="table in visibleSchema" :key="table.table" class="rounded-lg border border-slate-800 bg-slate-900/55 p-3">
                                <div class="flex items-center justify-between gap-3">
                                    <p class="font-mono text-sm font-semibold text-white">{{ table.table }}</p>
                                    <span class="text-xs text-slate-500">{{ table.rows }}</span>
                                </div>
                                <p class="mt-2 truncate text-xs text-slate-500">{{ table.indexes.join(', ') }}</p>
                            </div>
                        </div>
                    </section>

                    <section class="rounded-lg border border-slate-800 bg-slate-950/80 p-4 shadow-xl shadow-black/25">
                        <div class="mb-3 flex items-center justify-between">
                            <h2 class="text-sm font-semibold text-white">Selected node</h2>
                            <GitBranch class="h-4 w-4 text-teal-200" />
                        </div>
                        <div class="rounded-lg border p-4" :class="nodeTone(selectedNode.type)">
                            <p class="text-lg font-semibold">{{ selectedNode.label }}</p>
                            <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <span>Cost {{ selectedNode.cost }}</span>
                                <span>{{ selectedNode.rows.toLocaleString() }} rows</span>
                            </div>
                        </div>
                    </section>
                </aside>
            </div>
        </section>
    </main>
</template>