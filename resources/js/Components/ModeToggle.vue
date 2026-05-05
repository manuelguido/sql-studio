<script setup>
import { computed } from 'vue';
import { usePlayground } from '../Composables/usePlayground.js';

const { mode, setMode } = usePlayground();

const tabs = [
    { id: 'design',  label: 'Design',  hint: 'Visual schema editor' },
    { id: 'inspect', label: 'Inspect', hint: 'Read & analyze SQL' },
];

const active = computed(() => mode.value);
</script>

<template>
    <div
        role="tablist"
        aria-label="Workspace mode"
        class="inline-flex h-7 items-center rounded-sm border hairline-strong bg-[color:var(--color-surface)] p-0.5"
    >
        <button
            v-for="tab in tabs"
            :key="tab.id"
            role="tab"
            :aria-selected="active === tab.id"
            :title="tab.hint"
            @click="setMode(tab.id)"
            class="focus-ring flex h-6 items-center rounded-[3px] px-3 font-mono text-[11px] transition-colors"
            :class="active === tab.id
                ? 'bg-[color:var(--color-elev)] text-[color:var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-line-strong)]'
                : 'text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink-2)]'"
        >
            {{ tab.label }}
        </button>
    </div>
</template>
