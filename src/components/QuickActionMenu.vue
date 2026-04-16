<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
} from 'radix-vue';
import { Zap } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import Button from '@/components/ui/button/Button.vue';
import { useQuickActions } from '@/composables/useQuickActions';
import type { ClipboardItem } from '@/types';

const props = defineProps<{
  item: ClipboardItem;
  onActionDone?: () => void;
}>();

const emit = defineEmits<{
  (e: 'menu-open', value: boolean): void;
}>();

const { t } = useI18n();
const { getActionsForItem, executeAction } = useQuickActions();

const actions = computed(() => getActionsForItem(props.item));
const isOpen = ref(false);

watch(isOpen, (value) => {
  emit('menu-open', value);
});

async function handleAction(action: (typeof actions.value)[0]) {
  const ok = await executeAction(action, props.item);
  if (ok && props.onActionDone) {
    props.onActionDone();
  }
}
</script>

<template>
  <DropdownMenuRoot v-if="actions.length > 0" v-model:open="isOpen">
    <DropdownMenuTrigger as-child>
      <Button
        size="icon"
        variant="ghost"
        class="h-6 w-6 text-muted-foreground hover:text-primary"
        :title="t('quickActions.title')"
        @click.stop
      >
        <Zap class="w-3.5 h-3.5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        class="z-50 min-w-[160px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
        :side-offset="4"
        align="end"
        @click.stop
      >
        <DropdownMenuItem
          v-for="action in actions"
          :key="action.id"
          class="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          @click.stop="handleAction(action)"
        >
          <span
            class="mr-2 text-[9px] uppercase font-bold tracking-wider px-1 py-0.5 rounded"
            :class="{
              'bg-blue-500/10 text-blue-500': action.kind === 'copy',
              'bg-amber-500/10 text-amber-500': action.kind === 'update',
              'bg-green-500/10 text-green-500': action.kind === 'open',
            }"
          >
            {{ action.kind === 'copy' ? '⊕' : action.kind === 'open' ? '↗' : '✎' }}
          </span>
          {{ t(action.labelKey) }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
