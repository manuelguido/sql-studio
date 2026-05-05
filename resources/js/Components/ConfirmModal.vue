<script setup>
/**
 * ConfirmModal — generic two-action modal used for destructive confirms.
 *
 * Props:
 *   open      — v-model:open boolean
 *   title     — heading text
 *   message   — body text
 *   confirmLabel — primary button text
 *   cancelLabel  — secondary button text
 *   variant   — 'default' | 'danger'   (controls primary button color)
 *
 * Emits:
 *   update:open
 *   confirm
 *   cancel
 */
import { computed, onMounted, onUnmounted, watch, nextTick, ref } from 'vue';

const props = defineProps({
    open:         { type: Boolean, default: false },
    title:        { type: String, default: 'Confirm' },
    message:      { type: String, default: '' },
    confirmLabel: { type: String, default: 'Confirm' },
    cancelLabel:  { type: String, default: 'Cancel' },
    variant:      { type: String, default: 'default' }, // 'default' | 'danger'
});

const emit = defineEmits(['update:open', 'confirm', 'cancel']);

const confirmBtn = ref(null);

function close() {
    emit('update:open', false);
    emit('cancel');
}

function confirm() {
    emit('update:open', false);
    emit('confirm');
}

function onKey(e) {
    if (!props.open) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        close();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        confirm();
    }
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

watch(() => props.open, async (v) => {
    if (v) {
        await nextTick();
        confirmBtn.value?.focus();
    }
});

const primaryClass = computed(() =>
    props.variant === 'danger'
        ? 'border border-[color:var(--color-err)]/60 bg-[color:var(--color-err)]/15 text-[color:var(--color-err)] hover:bg-[color:var(--color-err)]/25'
        : 'border border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/25',
);
</script>

<template>
    <Teleport to="body">
        <Transition name="modal">
            <div
                v-if="open"
                class="fixed inset-0 z-[1000] flex items-center justify-center"
                role="dialog"
                aria-modal="true"
                :aria-label="title"
            >
                <!-- Backdrop -->
                <div
                    class="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                    @click="close"
                ></div>

                <!-- Panel -->
                <div
                    class="relative w-[420px] max-w-[calc(100vw-32px)] rounded-md border hairline-strong bg-[color:var(--color-chrome)] shadow-2xl"
                    @click.stop
                >
                    <div class="border-b hairline px-5 py-3">
                        <p class="font-mono text-[12.5px] font-semibold tracking-tight text-[color:var(--color-ink)]">
                            {{ title }}
                        </p>
                    </div>
                    <div class="px-5 py-4">
                        <p class="font-mono text-[12px] leading-relaxed text-[color:var(--color-ink-2)]">
                            <slot>{{ message }}</slot>
                        </p>
                    </div>
                    <div class="flex items-center justify-end gap-2 border-t hairline bg-[color:var(--color-surface)]/30 px-5 py-3">
                        <button
                            type="button"
                            @click="close"
                            class="focus-ring flex h-7 items-center rounded-sm border hairline-strong bg-transparent px-3 font-mono text-[11px] text-[color:var(--color-ink-2)] transition-colors hover:bg-[color:var(--color-elev)] hover:text-[color:var(--color-ink)]"
                        >{{ cancelLabel }}</button>
                        <button
                            ref="confirmBtn"
                            type="button"
                            @click="confirm"
                            class="focus-ring flex h-7 items-center rounded-sm px-3 font-mono text-[11px] font-medium transition-colors"
                            :class="primaryClass"
                        >{{ confirmLabel }}</button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
    transition: opacity 120ms ease;
}
.modal-enter-active > div:last-child,
.modal-leave-active > div:last-child {
    transition: transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 120ms ease;
}
.modal-enter-from,
.modal-leave-to {
    opacity: 0;
}
.modal-enter-from > div:last-child,
.modal-leave-to > div:last-child {
    transform: translateY(4px) scale(0.985);
    opacity: 0;
}
</style>
