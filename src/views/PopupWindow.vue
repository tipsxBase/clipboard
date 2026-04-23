<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useI18n } from 'vue-i18n';
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
  Pin,
  PinOff,
  Globe,
  Mail,
  Phone,
  Code,
  ScanText,
  Folder,
  Hash,
  Files,
  FileAudio,
  FileVideo,
  FileArchive,
  FileSpreadsheet,
  FileImage,
  FileCode,
  Clock,
  ArrowUpDown,
  Scissors,
} from 'lucide-vue-next';
import DOMPurify from 'dompurify';
import Button from '@/components/ui/button/Button.vue';
import Input from '@/components/ui/input/Input.vue';
import LocalImage from '@/components/LocalImage.vue';
import QuickActionMenu from '@/components/QuickActionMenu.vue';
import Select from '@/components/ui/select/Select.vue';
import SelectContent from '@/components/ui/select/SelectContent.vue';
import SelectItem from '@/components/ui/select/SelectItem.vue';
import SelectTrigger from '@/components/ui/select/SelectTrigger.vue';
import { useClipboard } from '@/composables/useClipboard';
import { useSettings } from '@/composables/useSettings';
import { useToast } from '@/composables/useToast';
import { useTimeAgo } from '@/composables/useTimeAgo';
import SelectValue from '@/components/ui/select/SelectValue.vue';

const { t } = useI18n();
const { toastMessage } = useToast();
const { formatTimeAgo } = useTimeAgo();

const {
  searchQuery,
  currentCollectionView,
  selectedIndex,
  previewItem,
  previewContent,
  filteredHistory,
  loadHistory,
  pasteItem,
  deleteItem,
  toggleSensitive,
  togglePin,
  toggleSnippet,
  scrollToSelected,
  setupClipboardListeners,
  selectedIds,
  toggleSelection,
  pasteStack,
  ocrImage,
  collections,
  activeCollectionId,
  openHistoryView,
  openAllCollectionsView,
  openCollectionView,
  loadCollections,
  timeRange,
  sortMode,
} = useClipboard();

import { invoke } from '@tauri-apps/api/core';
import type { ClipboardItem } from '@/types';

const { config, loadConfig, setupConfigListeners } = useSettings();
const isSelectingCollection = ref(false);
const showHtml = ref(false);
const linkedScreenshot = ref<ClipboardItem | null>(null);
const lastFocusRefreshAt = ref(0);
const POPUP_FOCUS_REFRESH_THROTTLE_MS = 600;
const currentCollectionLabel = computed(() => {
  if (currentCollectionView.value === 'all_collections') return t('collections.allCollections');
  if (currentCollectionView.value === 'collection_detail' && activeCollectionId.value) {
    return (
      collections.value.find((c) => c.id === activeCollectionId.value)?.name ||
      t('collections.allCollections')
    );
  }
  return t('searchPlaceholder');
});
const timeRangeOptions = computed(() => [
  { value: 'all', label: t('timeRange.all') },
  { value: 'today', label: t('timeRange.today') },
  { value: 'week', label: t('timeRange.week') },
]);
const currentTimeRangeLabel = computed(
  () =>
    timeRangeOptions.value.find((option) => option.value === (timeRange.value ?? 'all'))?.label ??
    t('timeRange.all')
);
const hasActiveHistoryFilters = computed(() => !!searchQuery.value || !!timeRange.value);
const emptyStateTitle = computed(() => {
  if (hasActiveHistoryFilters.value) {
    return t('emptyState.title');
  }

  if (currentCollectionView.value === 'all_collections') {
    return t('emptyState.allCollectionsTitle');
  }

  if (currentCollectionView.value === 'collection_detail') {
    return t('emptyState.collectionTitle', {
      name:
        collections.value.find((collection) => collection.id === activeCollectionId.value)?.name ||
        currentCollectionLabel.value,
    });
  }

  return t('emptyState.title');
});
const emptyStateSubtitle = computed(() => {
  if (hasActiveHistoryFilters.value) {
    return t('emptyState.subtitle');
  }

  if (currentCollectionView.value === 'all_collections') {
    return t('emptyState.allCollectionsSubtitle');
  }

  if (currentCollectionView.value === 'collection_detail') {
    return t('emptyState.collectionSubtitle');
  }

  return t('emptyState.subtitle');
});

watch(previewItem, async (newItem) => {
  showHtml.value = !!newItem?.html_content;
  // Fetch linked source screenshot for OCR text items
  if (newItem?.screenshot_id) {
    try {
      const item = await invoke<ClipboardItem | null>('get_item_by_id', {
        id: newItem.screenshot_id,
      });
      linkedScreenshot.value = item ?? null;
    } catch {
      linkedScreenshot.value = null;
    }
  } else {
    linkedScreenshot.value = null;
  }
});

const getCollection = (id?: number | null) => {
  if (!id) return null;
  return collections.value.find((collection) => collection.id === id) || null;
};

const getCollectionName = (id?: number) => getCollection(id)?.name;

function shouldShowCollectionBadge(item: ClipboardItem) {
  return currentCollectionView.value !== 'collection_detail' && !!getCollection(item.collection_id);
}

function getFilesList(content: string): string[] {
  try {
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function getFileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  if (!ext) return Files;

  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(ext)) {
    return FileImage;
  }
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
    return FileAudio;
  }
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv'].includes(ext)) {
    return FileVideo;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) {
    return FileArchive;
  }
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) {
    return FileSpreadsheet;
  }
  if (
    ['js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'py', 'rs', 'java', 'c', 'cpp'].includes(ext)
  ) {
    return FileCode;
  }
  if (['doc', 'docx', 'pdf', 'txt', 'rtf', 'md'].includes(ext)) {
    return FileText;
  }
  return Files;
}

function getItemIcon(item: any) {
  if (item.kind === 'image') return ImageIcon;
  if (item.kind === 'file') return Files;

  switch (item.data_type) {
    case 'url':
      return Globe;
    case 'email':
      return Mail;
    case 'code':
      return Code;
    case 'phone':
      return Phone;
    default:
      return FileText;
  }
}

async function handleItemActionDone() {
  await loadCollections();
  await loadHistory(true);
}

function handleItemClick(item: any, e: MouseEvent) {
  if (e.metaKey || e.ctrlKey) {
    toggleSelection(item);
  } else {
    pasteItem(item);
  }
}

function handleKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  const isInput =
    !!target && (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable);
  const isComposing = e.isComposing || (e as KeyboardEvent & { keyCode?: number }).keyCode === 229;

  if ((isInput || isComposing) && e.key !== 'Escape') {
    return;
  }

  const len = filteredHistory.value.length;
  if (len === 0 && e.key !== 'Escape') return;

  // Number keys 1-9 for quick paste
  if (e.key >= '1' && e.key <= '9') {
    const index = parseInt(e.key) - 1;
    if (index < len) {
      e.preventDefault();
      pasteItem(filteredHistory.value[index]);
      return;
    }
  }

  // Vim navigation
  if ((e.ctrlKey && e.key === 'n') || e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'j')) {
    e.preventDefault();
    selectedIndex.value = (selectedIndex.value + 1) % len;
    scrollToSelected();
  } else if ((e.ctrlKey && e.key === 'p') || e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'k')) {
    e.preventDefault();
    selectedIndex.value = (selectedIndex.value - 1 + len) % len;
    scrollToSelected();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedIds.value.length > 0) {
      pasteStack();
    } else if (filteredHistory.value[selectedIndex.value]) {
      pasteItem(filteredHistory.value[selectedIndex.value]);
    }
  } else if (e.key === 'x') {
    e.preventDefault();
    if (filteredHistory.value[selectedIndex.value]) {
      toggleSelection(filteredHistory.value[selectedIndex.value]);
    }
  } else if (e.key === ' ') {
    e.preventDefault();
    if (previewItem.value) {
      previewItem.value = null;
    } else if (filteredHistory.value[selectedIndex.value]) {
      previewItem.value = filteredHistory.value[selectedIndex.value];
    }
  } else if (e.key === 'Escape') {
    if (previewItem.value) {
      previewItem.value = null;
    } else {
      getCurrentWindow().hide();
    }
  }
}

onMounted(async () => {
  await loadConfig();
  await loadCollections();
  await loadHistory(true);
  await setupClipboardListeners();
  await setupConfigListeners();
  window.addEventListener('keydown', handleKeydown);

  // Focus search on show
  await listen('tauri://focus', () => {
    const now = Date.now();
    if (now - lastFocusRefreshAt.value < POPUP_FOCUS_REFRESH_THROTTLE_MS) {
      return;
    }
    lastFocusRefreshAt.value = now;
    loadCollections();
    loadHistory(true, { preserveExisting: true });
  });
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="app-shell flex flex-col select-none">
    <!-- Header -->
    <div class="app-header flex gap-2 items-center">
      <!-- Search Bar -->
      <div class="relative flex-1">
        <div class="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3">
          <Search class="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <Input
          v-model="searchQuery"
          class="w-full"
          input-class="app-toolbar-input h-9 rounded-xl pl-9 pr-3 text-sm"
          :placeholder="currentCollectionLabel"
        />
      </div>
      <Button
        size="icon"
        variant="ghost"
        class="app-toolbar-button shrink-0"
        :class="{
          'app-toolbar-button-active': isSelectingCollection || currentCollectionView !== 'history',
        }"
        @click="isSelectingCollection = !isSelectingCollection"
        :title="t('actions.collections')"
      >
        <Folder class="w-4 h-4" />
      </Button>
    </div>

    <!-- Quick Filters -->
    <div
      class="flex items-center gap-1 overflow-x-auto border-b border-border/80 bg-card px-3 py-2 no-scrollbar"
    >
      <Select
        :model-value="timeRange ?? 'all'"
        @update:model-value="(v) => (timeRange = String(v) === 'all' ? null : String(v))"
      >
        <SelectTrigger
          size="xs"
          class="min-w-[108px] rounded-lg border-border bg-card px-2.5 text-[10px] shadow-none"
        >
          <div class="flex min-w-0 items-center gap-1.5">
            <Clock class="h-3 w-3 shrink-0 text-muted-foreground" />
            <span class="truncate font-medium">{{ currentTimeRangeLabel }}</span>
          </div>
          <SelectValue class="hidden" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="range in timeRangeOptions" :key="range.value" :value="range.value">
            {{ range.label }}
          </SelectItem>
        </SelectContent>
      </Select>
      <div class="flex-1" />
      <Button
        @click="sortMode = sortMode === 'oldest' ? null : 'oldest'"
        variant="ghost"
        class="app-chip h-5 px-1.5 shrink-0 text-[8px]"
        :class="{ 'app-chip-active': sortMode === 'oldest' }"
      >
        <ArrowUpDown class="mr-0.5 h-2 w-2" />
        {{ t('sort.oldest') }}
      </Button>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
      <template v-if="isSelectingCollection">
        <div
          class="group relative app-list-item cursor-pointer p-2 flex items-center gap-2 hover:border-transparent hover:bg-accent/70"
          :class="{
            'app-list-item-active': currentCollectionView === 'history',
          }"
          @click="
            openHistoryView();
            isSelectingCollection = false;
          "
        >
          <Hash class="w-4 h-4 text-muted-foreground" />
          <span class="text-sm font-medium">{{ t('collections.allHistory') }}</span>
        </div>
        <div
          class="group relative app-list-item cursor-pointer p-2 flex items-center gap-2 hover:border-transparent hover:bg-accent/70"
          :class="{
            'app-list-item-active': currentCollectionView === 'all_collections',
          }"
          @click="
            openAllCollectionsView();
            isSelectingCollection = false;
          "
        >
          <Folder class="w-4 h-4 text-primary" />
          <span class="text-sm font-medium">{{ t('collections.allCollections') }}</span>
        </div>
        <div
          v-for="collection in collections"
          :key="collection.id"
          class="group relative app-list-item cursor-pointer p-2 flex items-center gap-2 hover:border-transparent hover:bg-accent/70"
          :class="{
            'app-list-item-active':
              currentCollectionView === 'collection_detail' && activeCollectionId === collection.id,
          }"
          @click="
            openCollectionView(collection.id);
            isSelectingCollection = false;
          "
        >
          <Folder class="w-4 h-4 text-primary" />
          <span class="text-sm font-medium">{{ collection.name }}</span>
        </div>
      </template>
      <template v-else>
        <div
          v-for="(item, index) in filteredHistory"
          :key="item.timestamp"
          class="group relative app-list-item cursor-pointer hover:border-transparent hover:bg-accent/70"
          :class="[
            index === selectedIndex ? 'app-list-item-active selected-item' : '',
            item.id && selectedIds.includes(item.id) ? 'border-primary/40 bg-primary/10' : '',
            config.compact_mode ? 'p-1.5' : 'p-2',
          ]"
          @click="handleItemClick(item, $event)"
          @mouseenter="selectedIndex = index"
        >
          <!-- Selection Badge -->
          <div
            v-if="item.id && selectedIds.includes(item.id)"
            class="absolute -top-1 -left-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center z-20 shadow-sm"
          >
            {{ selectedIds.indexOf(item.id) + 1 }}
          </div>

          <!-- Content -->
          <div class="flex gap-3" :class="config.compact_mode ? 'items-center' : 'items-start'">
            <div
              class="rounded-md bg-muted text-muted-foreground shrink-0 relative flex items-center justify-center"
              :class="config.compact_mode ? 'w-6 h-6 p-1' : 'w-7 h-7 mt-0.5 p-1.5'"
            >
              <component
                :is="getItemIcon(item)"
                :class="config.compact_mode ? 'w-3.5 h-3.5' : 'w-4 h-4'"
              />
              <div
                v-if="item.is_pinned"
                class="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5 shadow-sm"
              >
                <Pin class="w-2 h-2" />
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <div v-if="!config.compact_mode" class="flex justify-between items-baseline mb-0.5">
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-mono text-muted-foreground opacity-70">{{
                    formatTimeAgo(item.timestamp)
                  }}</span>
                  <div
                    v-if="shouldShowCollectionBadge(item)"
                    class="flex items-center gap-1 rounded-md border border-primary/15 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                  >
                    <Folder class="h-3 w-3" />
                    <span class="max-w-24 truncate">{{ getCollectionName(item.collection_id) }}</span>
                  </div>
                </div>
              </div>

              <div
                v-if="config.compact_mode"
                class="flex items-center justify-between gap-2"
                :class="{ 'pr-6': index < 9 }"
              >
                <div class="flex-1 min-w-0 flex items-center gap-2">
                  <p
                    v-if="item.kind === 'text'"
                    class="text-xs text-foreground line-clamp-1 break-all font-medium flex-1"
                    :class="{
                      'blur-sm group-hover:blur-none transition-all': item.is_sensitive,
                      'text-muted-foreground opacity-80': !!item.note,
                    }"
                  >
                    {{ item.content }}
                  </p>
                  <p
                    v-else-if="item.kind === 'file'"
                    class="text-xs text-foreground line-clamp-1 break-all font-medium flex-1"
                  >
                    {{ getFilesList(item.content).length }} Files:
                    {{ getFilesList(item.content)[0] }}
                  </p>
                  <div v-else class="flex items-center gap-2 flex-1">
                    <span class="text-xs text-muted-foreground italic">[Image]</span>
                  </div>
                </div>

                <div
                  v-if="shouldShowCollectionBadge(item)"
                  class="flex shrink-0 items-center gap-1 rounded-md border border-primary/15 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary"
                  :title="getCollectionName(item.collection_id)"
                >
                  <Folder class="h-2.5 w-2.5" />
                  <span class="max-w-16 truncate">{{ getCollectionName(item.collection_id) }}</span>
                </div>

                <span class="text-[9px] font-mono text-muted-foreground opacity-50 shrink-0">{{
                  formatTimeAgo(item.timestamp)
                }}</span>
              </div>

              <template v-else>
                <p v-if="item.note" class="text-sm font-semibold text-foreground mb-0.5">
                  {{ item.note }}
                </p>
                <p
                  v-if="item.kind === 'text'"
                  class="text-sm text-foreground line-clamp-2 break-all font-medium"
                  :class="{
                    'blur-sm group-hover:blur-none transition-all': item.is_sensitive,
                    'text-muted-foreground text-xs': !!item.note,
                  }"
                >
                  {{ item.content }}
                </p>
                <div v-else-if="item.kind === 'file'" class="flex flex-col gap-1 mt-1">
                  <div
                    v-for="(file, i) in getFilesList(item.content).slice(0, 3)"
                    :key="i"
                    class="text-xs text-foreground bg-muted/50 px-2 py-1 rounded truncate flex items-center gap-2"
                  >
                    <component
                      :is="getFileIcon(file)"
                      class="shrink-0 w-4 h-4 text-muted-foreground"
                    />
                    <span class="truncate">{{ file }}</span>
                  </div>
                  <div
                    v-if="getFilesList(item.content).length > 3"
                    class="text-[10px] text-muted-foreground pl-1"
                  >
                    + {{ getFilesList(item.content).length - 3 }} more
                  </div>
                </div>
                <div
                  v-else
                  class="h-16 w-full rounded-md overflow-hidden bg-muted/50 border border-border mt-1"
                >
                  <LocalImage
                    :src="item.content"
                    class="h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                </div>
              </template>
            </div>
          </div>

          <!-- Hover Actions -->
          <div
            class="absolute right-2 top-2 z-20 flex gap-1 rounded-md border border-border bg-card p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
            @click.stop
          >
            <QuickActionMenu :item="item" :on-action-done="handleItemActionDone" />
            <Button
              @click.stop="togglePin(index)"
              size="icon"
              variant="ghost"
              class="h-6 w-6"
              :class="item.is_pinned ? 'text-primary' : 'text-muted-foreground'"
              :title="item.is_pinned ? t('actions.unpin') : t('actions.pin')"
            >
              <component :is="item.is_pinned ? PinOff : Pin" class="w-3.5 h-3.5" />
            </Button>
            <Button
              @click.stop="item.id && toggleSnippet(item.id)"
              size="icon"
              variant="ghost"
              class="h-6 w-6"
              :class="item.is_snippet ? 'text-orange-500' : 'text-muted-foreground'"
              :title="item.is_snippet ? t('actions.removeSnippet') : t('actions.addSnippet')"
            >
              <Scissors class="w-3.5 h-3.5" />
            </Button>
            <Button
              @click.stop="toggleSensitive(index)"
              size="icon"
              variant="ghost"
              class="h-6 w-6"
              :class="item.is_sensitive ? 'text-yellow-500' : 'text-muted-foreground'"
              :title="
                item.is_sensitive ? t('actions.sensitiveTooltip') : t('actions.markSensitive')
              "
            >
              <component :is="item.is_sensitive ? Lock : Unlock" class="w-3.5 h-3.5" />
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

          <!-- Status / Shortcuts (Visible when NOT hovering) -->
          <div
            class="absolute top-2 right-2 flex gap-2 items-center opacity-100 group-hover:opacity-0 transition-opacity pointer-events-none"
          >
            <!-- Number Shortcut -->
            <span
              v-if="index < 9"
              class="flex items-center justify-center w-4 h-4 bg-muted/50 text-muted-foreground rounded border border-border/50 text-[9px] font-mono shadow-sm"
            >
              {{ index + 1 }}
            </span>

            <!-- Sensitive Lock -->
            <Lock v-if="item.is_sensitive" class="w-3 h-3 text-yellow-600/50" />
          </div>
        </div>

        <div
          v-if="filteredHistory.length === 0"
          class="flex flex-col items-center justify-center h-40 text-muted-foreground"
        >
          <Command class="w-8 h-8 mb-2 opacity-20" />
          <p class="text-sm">{{ emptyStateTitle }}</p>
          <p class="text-xs opacity-50 mt-1">{{ emptyStateSubtitle }}</p>
        </div>
      </template>
    </div>

    <!-- Footer -->
    <div class="flex justify-end border-t border-border bg-card px-3 py-1.5">
      <div class="flex items-center gap-3 text-[10px] text-muted-foreground">
        <div class="flex items-center gap-1">
          <span class="bg-muted px-1.5 py-0.5 rounded border border-border font-mono text-[9px]"
            >1-9</span
          >
          <span>{{ t('shortcuts.paste') }}</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="bg-muted px-1.5 py-0.5 rounded border border-border font-mono text-[9px]"
            >Space</span
          >
          <span>{{ t('shortcuts.preview') }}</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="bg-muted px-1.5 py-0.5 rounded border border-border font-mono text-[9px]"
            >x</span
          >
          <span>{{ t('shortcuts.select') }}</span>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <Transition name="fade">
      <div
        v-if="toastMessage"
        class="fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg"
      >
        {{ toastMessage }}
      </div>
    </Transition>

    <!-- Preview Modal -->
    <div
      v-if="previewItem"
      class="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 sm:p-8"
      @click.self="previewItem = null"
    >
      <div
        class="bg-card rounded-xl shadow-2xl border border-border max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden"
      >
        <div class="flex items-center justify-between border-b border-border bg-card px-4 py-4">
          <div class="flex items-center gap-2 text-muted-foreground">
            <FileText v-if="previewItem.kind === 'text'" class="w-4 h-4" />
            <Files v-else-if="previewItem.kind === 'file'" class="w-4 h-4" />
            <ImageIcon v-else class="w-4 h-4" />
            <span class="text-sm font-medium">{{ formatTimeAgo(previewItem.timestamp) }}</span>
          </div>
          <Button @click="previewItem = null" size="icon" variant="ghost" class="h-8 w-8">
            <X class="w-5 h-5" />
          </Button>
        </div>
        <div class="overflow-auto bg-card px-6 py-6">
          <div v-if="previewItem.kind === 'text'" class="flex flex-col gap-2">
            <div v-if="previewItem.html_content" class="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                class="h-6 text-xs gap-1"
                @click="showHtml = !showHtml"
              >
                <component :is="showHtml ? FileText : Code" class="w-3 h-3" />
                {{ showHtml ? 'Text' : 'HTML' }}
              </Button>
            </div>
            <div
              v-if="showHtml && previewItem.html_content"
              class="rounded-md border border-input bg-background shadow-sm overflow-auto text-sm leading-relaxed"
            >
              <div
                class="p-4 min-w-full w-fit"
                v-html="
                  DOMPurify.sanitize(previewItem.html_content, {
                    ADD_ATTR: ['style'],
                  })
                "
              ></div>
            </div>
            <pre v-else class="font-mono text-sm text-foreground whitespace-pre-wrap break-all">{{
              previewContent || previewItem.content
            }}</pre>
            <!-- Linked source screenshot for OCR text -->
            <div v-if="linkedScreenshot" class="mt-3 pt-3 border-t border-border">
              <p class="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <ImageIcon class="w-3 h-3" />
                {{ t('preview.sourceScreenshot') }}
              </p>
              <LocalImage
                :src="linkedScreenshot.content"
                class="max-w-full max-h-40 rounded-md shadow-sm cursor-pointer hover:opacity-80 transition-opacity"
                @click="previewItem = linkedScreenshot"
              />
            </div>
          </div>
          <div v-else-if="previewItem.kind === 'file'" class="flex flex-col gap-2">
            <h3 class="font-medium text-sm text-muted-foreground">
              {{ getFilesList(previewItem.content).length }} Files
            </h3>
            <div class="space-y-1">
              <div
                v-for="(file, i) in getFilesList(previewItem.content)"
                :key="i"
                class="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm break-all font-mono"
              >
                <component :is="getFileIcon(file)" class="shrink-0 w-5 h-5 text-muted-foreground" />
                {{ file }}
              </div>
            </div>
          </div>
          <div v-else class="flex justify-center">
            <LocalImage :src="previewItem.content" class="max-w-full rounded-lg shadow-lg" />
          </div>
        </div>
        <div class="flex justify-end gap-2 border-t border-border bg-card px-3 py-3">
          <Button
            v-if="previewItem.kind === 'image'"
            @click="ocrImage(previewItem!)"
            variant="secondary"
            class="gap-2"
          >
            <ScanText class="w-4 h-4" /> {{ t('actions.ocr') }}
          </Button>
          <Button
            @click="
              pasteItem(previewItem!);
              previewItem = null;
            "
            class="gap-2"
          >
            <CornerDownLeft class="w-4 h-4" /> {{ t('actions.paste') }}
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
