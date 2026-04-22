<script setup lang="ts">
import { cn } from '@/lib/utils';
import { computed } from 'vue';

const props = defineProps<{
  modelValue: string | number;
  class?: any;
  inputClass?: any;
  type?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void;
}>();

defineOptions({
  inheritAttrs: false,
});

const value = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});
</script>

<template>
  <div :class="cn('relative', $props.class)">
    <input
      v-bind="$attrs"
      v-model="value"
      :type="type || 'text'"
      :class="
        cn(
          'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm leading-5 shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          props.inputClass
        )
      "
    />
    <slot name="icon" />
  </div>
</template>
