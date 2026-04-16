<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  value?: number;
  max?: number;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  value: 0,
  max: 100,
  class: '',
});

const percentage = computed(() => {
  const percent = Math.min(Math.max((props.value / props.max) * 100, 0), 100);
  return percent;
});
</script>

<template>
  <div
    :class="['relative h-2 w-full overflow-hidden rounded-full bg-secondary', props.class]"
  >
    <div
      class="h-full bg-primary transition-all duration-300 ease-in-out"
      :style="{ width: `${percentage}%` }"
    />
  </div>
</template>