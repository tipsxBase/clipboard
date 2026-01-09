<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  text: string;
  query: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
}>();

const parts = computed(() => {
  if (!props.query) return [{ text: props.text, highlight: false }];

  try {
    let regex: RegExp;
    if (props.isRegex) {
      regex = new RegExp(
        `(${props.query})`,
        props.isCaseSensitive ? "g" : "gi"
      );
    } else {
      // Escape special characters for regex
      const escaped = props.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      regex = new RegExp(`(${escaped})`, props.isCaseSensitive ? "g" : "gi");
    }

    // Split keeps capturing groups in the result array
    const split = props.text.split(regex);

    return split
      .map((part, index) => ({
        text: part,
        highlight: index % 2 === 1 && part.length > 0,
      }))
      .filter((p) => p.text.length > 0);
  } catch (e) {
    // If regex is invalid, return original text
    return [{ text: props.text, highlight: false }];
  }
});
</script>

<template>
  <span>
    <template v-for="(part, i) in parts" :key="i">
      <span
        v-if="part.highlight"
        class="bg-yellow-500/30 text-foreground box-decoration-clone rounded-[2px] px-0.5"
        >{{ part.text }}</span
      >
      <span v-else>{{ part.text }}</span>
    </template>
  </span>
</template>
