<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useI18n } from "vue-i18n";
import {
  Search,
  FileText,
  Image as ImageIcon,
  Lock,
  Unlock,
  X,
  Eye,
  Command,
  CornerDownLeft,
} from "lucide-vue-next";
import Button from "@/components/ui/button/Button.vue";
import Input from "@/components/ui/input/Input.vue";
import LocalImage from "@/components/LocalImage.vue";
import { useClipboard } from "@/composables/useClipboard";
import { useSettings } from "@/composables/useSettings";
import { useToast } from "@/composables/useToast";
import { useTimeAgo } from "@/composables/useTimeAgo";

const { t } = useI18n();
const { toastMessage } = useToast();
const { formatTimeAgo } = useTimeAgo();

const {
  searchQuery,
  selectedIndex,
  previewItem,
  previewContent,
  filteredHistory,
  loadHistory,
  pasteItem,
  deleteItem,
  toggleSensitive,
  scrollToSelected,
  setupClipboardListeners,
} = useClipboard();

const { loadConfig, setupConfigListeners } = useSettings();

function handleKeydown(e: KeyboardEvent) {
  const len = filteredHistory.value.length;
  if (len === 0 && e.key !== "Escape") return;

  // Vim navigation
  if (
    (e.ctrlKey && e.key === "n") ||
    e.key === "ArrowDown" ||
    (e.ctrlKey && e.key === "j")
  ) {
    e.preventDefault();
    selectedIndex.value = (selectedIndex.value + 1) % len;
    scrollToSelected();
  } else if (
    (e.ctrlKey && e.key === "p") ||
    e.key === "ArrowUp" ||
    (e.ctrlKey && e.key === "k")
  ) {
    e.preventDefault();
    selectedIndex.value = (selectedIndex.value - 1 + len) % len;
    scrollToSelected();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (filteredHistory.value[selectedIndex.value]) {
      pasteItem(filteredHistory.value[selectedIndex.value]);
    }
  } else if (e.key === " ") {
    e.preventDefault();
    if (filteredHistory.value[selectedIndex.value]) {
      previewItem.value = filteredHistory.value[selectedIndex.value];
    }
  } else if (e.key === "Escape") {
    if (previewItem.value) {
      previewItem.value = null;
    } else {
      getCurrentWindow().hide();
    }
  }
}

onMounted(async () => {
  await loadConfig();
  await loadHistory();
  await setupClipboardListeners();
  await setupConfigListeners();
  window.addEventListener("keydown", handleKeydown);

  // Focus search on show
  await listen("tauri://focus", () => {
    loadHistory();
  });
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div
    class="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden select-none"
  >
    <!-- Header -->
    <div class="border-b border-border bg-card/50 backdrop-blur-sm p-2">
      <!-- Search Bar -->
      <div class="relative">
        <Search
          class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground"
        />
        <Input
          v-model="searchQuery"
          class="w-full pl-9 h-8 text-xs"
          :placeholder="t('searchPlaceholder')"
        />
      </div>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
      <TransitionGroup name="list">
        <div
          v-for="(item, index) in filteredHistory"
          :key="item.timestamp"
          class="group relative rounded-lg border border-transparent hover:bg-accent/50 hover:border-border transition-all cursor-pointer p-2"
          :class="[
            index === selectedIndex
              ? 'bg-accent border-primary/20 selected-item'
              : '',
          ]"
          @click="pasteItem(item)"
          @mouseenter="selectedIndex = index"
        >
          <!-- Content -->
          <div class="flex gap-3 items-start">
            <div
              class="mt-0.5 p-1.5 rounded-md bg-muted text-muted-foreground shrink-0"
            >
              <FileText v-if="item.kind === 'text'" class="w-4 h-4" />
              <ImageIcon v-else class="w-4 h-4" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex justify-between items-baseline mb-0.5">
                <span
                  class="text-[10px] font-mono text-muted-foreground opacity-70"
                  >{{ formatTimeAgo(item.timestamp) }}</span
                >
              </div>
              <p
                v-if="item.kind === 'text'"
                class="text-sm text-foreground line-clamp-2 break-all font-medium"
                :class="{
                  'blur-sm group-hover:blur-none transition-all':
                    item.is_sensitive,
                }"
              >
                {{ item.content }}
              </p>
              <div
                v-else
                class="h-16 w-full rounded-md overflow-hidden bg-muted/50 border border-border mt-1"
              >
                <LocalImage
                  :src="item.content"
                  class="h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                />
              </div>
            </div>
          </div>

          <!-- Hover Actions -->
          <div
            class="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm rounded-md p-0.5 shadow-sm border border-border"
          >
            <Button
              @click.stop="toggleSensitive(index)"
              size="icon"
              variant="ghost"
              class="h-6 w-6"
              :class="
                item.is_sensitive ? 'text-yellow-500' : 'text-muted-foreground'
              "
              :title="
                item.is_sensitive
                  ? t('actions.sensitiveTooltip')
                  : t('actions.markSensitive')
              "
            >
              <component
                :is="item.is_sensitive ? Lock : Unlock"
                class="w-3.5 h-3.5"
              />
            </Button>
            <Button
              @click.stop="previewItem = item"
              size="icon"
              variant="ghost"
              class="h-6 w-6 text-muted-foreground hover:text-primary"
              :title="t('actions.preview')"
            >
              <Eye class="w-3.5 h-3.5" />
            </Button>
            <Button
              @click.stop="deleteItem(index)"
              size="icon"
              variant="ghost"
              class="h-6 w-6 text-muted-foreground hover:text-destructive"
              :title="t('actions.delete')"
            >
              <X class="w-3.5 h-3.5" />
            </Button>
          </div>

          <!-- Always visible lock if sensitive -->
          <div
            v-if="item.is_sensitive"
            class="absolute top-2 right-2 opacity-100 group-hover:opacity-0 transition-opacity pointer-events-none"
          >
            <Lock class="w-3 h-3 text-yellow-600/50" />
          </div>
        </div>
      </TransitionGroup>

      <div
        v-if="filteredHistory.length === 0"
        class="flex flex-col items-center justify-center h-40 text-muted-foreground"
      >
        <Command class="w-8 h-8 mb-2 opacity-20" />
        <p class="text-sm">{{ t("emptyState.title") }}</p>
        <p class="text-xs opacity-50 mt-1">{{ t("emptyState.subtitle") }}</p>
      </div>
    </div>

    <!-- Toast -->
    <Transition name="fade">
      <div
        v-if="toastMessage"
        class="fixed bottom-10 left-1/2 transform -translate-x-1/2 bg-foreground text-background px-4 py-2 rounded-full text-xs font-medium shadow-lg backdrop-blur-sm z-50"
      >
        {{ toastMessage }}
      </div>
    </Transition>

    <!-- Preview Modal -->
    <div
      v-if="previewItem"
      class="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-8"
      @click.self="previewItem = null"
    >
      <div
        class="bg-card rounded-xl shadow-2xl border border-border max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden"
      >
        <div
          class="p-4 border-b border-border flex justify-between items-center bg-muted/30"
        >
          <div class="flex items-center gap-2 text-muted-foreground">
            <FileText v-if="previewItem.kind === 'text'" class="w-4 h-4" />
            <ImageIcon v-else class="w-4 h-4" />
            <span class="text-sm font-medium">{{
              formatTimeAgo(previewItem.timestamp)
            }}</span>
          </div>
          <Button
            @click="previewItem = null"
            size="icon"
            variant="ghost"
            class="h-8 w-8"
          >
            <X class="w-5 h-5" />
          </Button>
        </div>
        <div class="p-6 overflow-auto bg-muted/10">
          <pre
            v-if="previewItem.kind === 'text'"
            class="font-mono text-sm text-foreground whitespace-pre-wrap break-all"
            >{{ previewContent || previewItem.content }}</pre
          >
          <div v-else class="flex justify-center">
            <LocalImage
              :src="previewItem.content"
              class="max-w-full rounded-lg shadow-lg"
            />
          </div>
        </div>
        <div
          class="p-3 border-t border-border bg-muted/30 flex justify-end gap-2"
        >
          <Button
            @click="
              pasteItem(previewItem!);
              previewItem = null;
            "
            class="gap-2"
          >
            <CornerDownLeft class="w-4 h-4" /> {{ t("actions.paste") }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--muted));
  border-radius: 2px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground));
}

.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
