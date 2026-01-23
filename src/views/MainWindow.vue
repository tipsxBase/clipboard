<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useI18n } from "vue-i18n";
import { toTypedSchema } from "@vee-validate/zod";
import * as z from "zod";
import { useForm } from "vee-validate";
import {
  Search,
  Settings,
  CaseSensitive,
  Regex,
  Trash2,
  Pause,
  Play,
  FileText,
  Image as ImageIcon,
  Lock,
  Unlock,
  X,
  Eye,
  Command,
  CornerDownLeft,
  Plus,
  Pin,
  PinOff,
  Ban,
  Folder,
  FolderPlus,
  Hash,
  Globe,
  Mail,
  Phone,
  Code,
  ScanText,
  Edit2,
  NotepadText,
  Files,
  FileAudio,
  FileVideo,
  FileArchive,
  FileSpreadsheet,
  FileImage,
  FileCode,
} from "lucide-vue-next";
import DOMPurify from "dompurify";
import Button from "@/components/ui/button/Button.vue";
import Input from "@/components/ui/input/Input.vue";
import { Switch } from "@/components/ui/switch";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
} from "@/components/ui/form";
import { useClipboard } from "@/composables/useClipboard";
import { useSettings } from "@/composables/useSettings";
import { useToast } from "@/composables/useToast";
import { useTimeAgo } from "@/composables/useTimeAgo";
import type { ClipboardItem } from "@/types";
import {
  Dialog,
  DialogHeader,
  DialogDescription,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import LocalImage from "@/components/LocalImage.vue";
import Select from "@/components/ui/select/Select.vue";
import SelectTrigger from "@/components/ui/select/SelectTrigger.vue";
import SelectValue from "@/components/ui/select/SelectValue.vue";
import SelectContent from "@/components/ui/select/SelectContent.vue";
import SelectItem from "@/components/ui/select/SelectItem.vue";
import ItemEditorDialog from "@/components/ItemEditorDialog.vue";
import HighlightText from "@/components/HighlightText.vue";

const { t } = useI18n();
const { toastMessage } = useToast();
const { formatTimeAgo } = useTimeAgo();

const {
  collections,
  totalCount,
  searchQuery,
  searchRegex,
  searchCaseSensitive,
  selectedIndex,
  activeFilter,
  activeCollectionId,
  previewItem,
  previewContent,
  filteredHistory,
  loadHistory,
  loadCollections,
  createCollection,
  deleteCollection,
  setItemCollection,
  pasteItem,
  deleteItem,
  toggleSensitive,
  togglePin,
  clearHistory,
  scrollToSelected,
  setupClipboardListeners,
  loadMore,
  isLoading,
  hasMore,
  ocrImage,
  updateItemContent,
  addItem,
} = useClipboard();
function getFilesList(content: string): string[] {
  try {
    return JSON.parse(content);
  } catch {
    return [];
  }
}

// function isImageFile(path: string): boolean {
//   const ext = path.split(".").pop()?.toLowerCase();
//   return ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"].includes(
//     ext || ""
//   );
// }

function getFileIcon(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (!ext) return Files;

  if (
    ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico"].includes(ext)
  ) {
    return FileImage;
  }
  if (["mp3", "wav", "ogg", "m4a", "flac", "aac"].includes(ext)) {
    return FileAudio;
  }
  if (["mp4", "mkv", "avi", "mov", "webm", "wmv"].includes(ext)) {
    return FileVideo;
  }
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(ext)) {
    return FileArchive;
  }
  if (["xls", "xlsx", "csv", "numbers"].includes(ext)) {
    return FileSpreadsheet;
  }
  if (
    [
      "js",
      "ts",
      "jsx",
      "tsx",
      "json",
      "html",
      "css",
      "py",
      "rs",
      "java",
      "c",
      "cpp",
    ].includes(ext)
  ) {
    return FileCode;
  }
  if (["doc", "docx", "pdf", "txt", "rtf", "md"].includes(ext)) {
    return FileText;
  }
  return Files;
}

const getCollectionName = (id?: number) => {
  if (!id) return undefined;
  return collections.value.find((c) => c.id === id)?.name;
};

function handleScroll(e: Event) {
  const target = e.target as HTMLElement;
  if (
    target.scrollHeight - target.scrollTop - target.clientHeight < 100 &&
    !isLoading.value &&
    hasMore.value
  ) {
    loadMore();
  }
}

const {
  config,
  showSettings,
  tempShortcut,
  tempMaxSize,
  tempLanguage,
  tempTheme,
  tempSensitiveApps,
  tempCompactMode,
  tempClearPinnedOnClear,
  tempClearCollectedOnClear,
  isRecording,
  isPaused,
  isAutoStart,
  loadConfig,
  saveConfig,
  openSettings,
  toggleAutoStart,
  togglePause,
  startRecording,
  handleShortcutKeydown,
  setupConfigListeners,
} = useSettings();

const showItemEditor = ref(false);
const editingItem = ref<ClipboardItem | null>(null);
const editingNoteOnly = ref(false);
const showHtml = ref(false);

watch(previewItem, (newItem) => {
  showHtml.value = !!newItem?.html_content;
  editingNoteOnly.value = false;
});

function openEditor(item: ClipboardItem | null, noteOnly: boolean = false) {
  editingItem.value = item;
  editingNoteOnly.value = noteOnly;
  showItemEditor.value = true;
}

function handleEditorSave(data: {
  content: string;
  dataType: string;
  note?: string;
  id?: number;
  html_content?: string;
}) {
  if (data.id) {
    updateItemContent(
      data.id,
      data.content,
      data.dataType,
      data.note,
      data.html_content,
    );
  } else {
    addItem(data.content);
  }
}

// Form schema
const formSchema = toTypedSchema(
  z.object({
    shortcut: z.string().min(1, "Shortcut is required"),
    max_history_size: z.number().min(5).max(1000),
    language: z.string(),
    theme: z.string(),
    sensitive_apps: z.array(z.string()),
    compact_mode: z.boolean(),
    clear_pinned_on_clear: z.boolean(),
    clear_collected_on_clear: z.boolean(),
  }),
);

const form = useForm({
  validationSchema: formSchema,
  initialValues: {
    shortcut: tempShortcut.value,
    max_history_size: tempMaxSize.value,
    language: tempLanguage.value,
    theme: tempTheme.value,
    sensitive_apps: tempSensitiveApps.value,
    compact_mode: tempCompactMode.value,
    clear_pinned_on_clear: tempClearPinnedOnClear.value,
    clear_collected_on_clear: tempClearCollectedOnClear.value,
  },
});

const onSubmit = form.handleSubmit(async (values) => {
  tempShortcut.value = values.shortcut;
  tempMaxSize.value = values.max_history_size;
  tempLanguage.value = values.language;
  tempTheme.value = values.theme;
  tempSensitiveApps.value = values.sensitive_apps;
  tempCompactMode.value = values.compact_mode;
  tempClearPinnedOnClear.value = values.clear_pinned_on_clear;
  tempClearCollectedOnClear.value = values.clear_collected_on_clear;
  await saveConfig();
});

// Watch showSettings to reset form values when opened
watch(showSettings, (isOpen) => {
  if (isOpen) {
    form.resetForm({
      values: {
        shortcut: tempShortcut.value,
        max_history_size: tempMaxSize.value,
        language: tempLanguage.value,
        theme: tempTheme.value,
        sensitive_apps: [...tempSensitiveApps.value],
        compact_mode: tempCompactMode.value,
        clear_pinned_on_clear: tempClearPinnedOnClear.value,
        clear_collected_on_clear: tempClearCollectedOnClear.value,
      },
    });
  }
});

const newAppInput = ref("");
const showClearConfirm = ref(false);
const showCollections = ref(false);
const newCollectionName = ref("");
const itemToAddToCollection = ref<ClipboardItem | null>(null);

async function handleCreateCollection() {
  if (newCollectionName.value.trim()) {
    await createCollection(newCollectionName.value.trim());
    newCollectionName.value = "";
  }
}

async function handleAddToCollection(collectionId: number | null) {
  if (itemToAddToCollection.value && itemToAddToCollection.value.id) {
    await setItemCollection(itemToAddToCollection.value.id, collectionId);
    itemToAddToCollection.value = null;
  }
}

function addSensitiveApp(appName?: string) {
  const app = appName || newAppInput.value.trim();
  if (app) {
    const currentApps = form.values.sensitive_apps || [];
    if (!currentApps.includes(app)) {
      form.setFieldValue("sensitive_apps", [...currentApps, app]);
      tempSensitiveApps.value.push(app);
      if (appName) {
        // If added via button, save immediately
        config.value.sensitive_apps = [...tempSensitiveApps.value];
        saveConfig();
        toastMessage.value = t("settings.appBlocked", { app });
      }
    }
    if (!appName) newAppInput.value = "";
  }
}

// function handleDragStart(e: DragEvent, item: ClipboardItem) {
//   if (e.dataTransfer) {
//     e.dataTransfer.effectAllowed = "copy";

//     // Set text/plain for all items as fallback
//     e.dataTransfer.setData("text/plain", item.content);

//     if (item.kind === "image") {
//       // For images, we try to set file URL if it's a local path
//       if (item.content.startsWith("/") || item.content.match(/^[a-zA-Z]:\//)) {
//         const fileUrl = `file://${item.content}`;
//         if (item.kind === "file") return Files;
//         e.dataTransfer.setData("text/uri-list", fileUrl);
//       }
//     }
//   }
// }

function getItemIcon(item: ClipboardItem) {
  if (item.kind === "image") return ImageIcon;

  switch (item.data_type) {
    case "url":
      return Globe;
    case "email":
      return Mail;
    case "code":
      return Code;
    case "phone":
      return Phone;
    default:
      return FileText;
  }
}

function getFilterIcon(filter: string) {
  switch (filter) {
    case "text":
      return FileText;
    case "image":
      return ImageIcon;
    case "file":
      return Files;
    case "sensitive":
      return Lock;
    case "url":
      return Globe;
    case "email":
      return Mail;
    case "code":
      return Code;
    case "phone":
      return Phone;
    default:
      return null;
  }
}

function removeSensitiveApp(app: string) {
  const currentApps = form.values.sensitive_apps || [];
  form.setFieldValue(
    "sensitive_apps",
    currentApps.filter((a) => a !== app),
  );
  tempSensitiveApps.value = tempSensitiveApps.value.filter((a) => a !== app);
}

function handleKeydown(e: KeyboardEvent) {
  // Ignore keydown events coming from input elements or when dialogs are open
  const target = e.target as HTMLElement;
  const isInput =
    ["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable;
  const isDialogGiven = showSettings.value || showItemEditor.value;

  if ((isInput || isDialogGiven) && e.key !== "Escape") return;

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
      pasteItem(filteredHistory.value[selectedIndex.value], false);
    }
  } else if (e.key === " ") {
    e.preventDefault();
    if (previewItem.value) {
      previewItem.value = null;
    } else if (filteredHistory.value[selectedIndex.value]) {
      previewItem.value = filteredHistory.value[selectedIndex.value];
    }
  } else if (e.key === "Escape") {
    if (previewItem.value) {
      previewItem.value = null;
    } else if (showSettings.value) {
      showSettings.value = false;
    } else {
      getCurrentWindow().hide();
    }
  }
}

onMounted(async () => {
  await loadConfig();
  await loadHistory(true);
  await loadCollections();
  await setupClipboardListeners();
  await setupConfigListeners();
  window.addEventListener("keydown", handleKeydown);

  // Focus search on show
  await listen("tauri://focus", () => {
    loadHistory(true);
  });
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div
    class="h-screen w-screen bg-background/60 text-foreground flex flex-col overflow-hidden"
  >
    <!-- Header -->
    <div
      class="border-b border-border bg-card/40 backdrop-blur-md p-3 space-y-3"
    >
      <!-- Search Bar -->
      <div class="relative flex items-center gap-2">
        <div class="relative flex-1">
          <Search
            class="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground"
          />
          <Input
            v-model="searchQuery"
            class="w-full pl-9 h-8 text-xs relative"
            :placeholder="t('searchPlaceholder')"
          >
            <template #icon>
              <div
                class="absolute right-1 top-1/2 transform -translate-y-1/2 flex items-center gap-0.5"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 rounded-sm"
                  :class="{
                    'bg-accent text-accent-foreground': searchCaseSensitive,
                  }"
                  @click="searchCaseSensitive = !searchCaseSensitive"
                  :title="t('search.matchCase') || 'Match Case'"
                >
                  <CaseSensitive class="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 rounded-sm"
                  :class="{ 'bg-accent text-accent-foreground': searchRegex }"
                  @click="searchRegex = !searchRegex"
                  :title="t('search.regex') || 'Use Regular Expression'"
                >
                  <Regex class="w-3.5 h-3.5" />
                </Button>
              </div>
            </template>
          </Input>
        </div>
        <div class="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {{ totalCount }} {{ t("stats.items") }}
        </div>
      </div>

      <!-- Filters & Actions -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex gap-1 overflow-x-auto no-scrollbar flex-1">
          <Button
            v-for="filter in [
              'all',
              'text',
              'image',
              'file',
              'sensitive',
              'url',
              'email',
              'code',
              'phone',
            ]"
            :key="filter"
            @click="activeFilter = filter as any"
            size="sm"
            :variant="activeFilter === filter ? 'default' : 'ghost'"
            class="h-6 text-[10px] uppercase font-bold tracking-wider rounded-full px-2.5 shrink-0"
          >
            <component
              :is="getFilterIcon(filter)"
              class="w-3 h-3 mr-1"
              v-if="filter !== 'all'"
            />
            {{ t(`filters.${filter}`) }}
          </Button>
        </div>

        <div class="flex gap-1 shrink-0">
          <Button
            @click="showCollections = !showCollections"
            size="icon"
            variant="ghost"
            class="h-7 w-7"
            :class="{ 'bg-accent text-accent-foreground': showCollections }"
            :title="t('actions.collections')"
          >
            <Folder class="w-4 h-4" />
          </Button>
          <Button
            @click="togglePause"
            size="icon"
            variant="ghost"
            class="h-7 w-7"
            :class="{ 'text-yellow-500': isPaused }"
            :title="
              isPaused
                ? t('actions.resumeRecording')
                : t('actions.pauseRecording')
            "
          >
            <component :is="isPaused ? Play : Pause" class="w-4 h-4" />
          </Button>
          <Button
            @click="openEditor(null)"
            size="icon"
            variant="ghost"
            class="h-7 w-7"
            :title="t('actions.addItem')"
          >
            <Plus class="w-4 h-4" />
          </Button>
          <Button
            @click="openSettings"
            size="icon"
            variant="ghost"
            class="h-7 w-7"
            :title="t('actions.settings')"
          >
            <Settings class="w-4 h-4" />
          </Button>
          <Button
            @click="showClearConfirm = true"
            size="icon"
            variant="ghost"
            class="h-7 w-7 hover:text-destructive"
            :title="t('actions.clearHistory')"
          >
            <Trash2 class="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>

    <div class="flex-1 flex overflow-hidden">
      <!-- Collections Sidebar -->
      <div
        v-if="showCollections"
        class="w-48 border-r border-border bg-card/30 backdrop-blur-sm flex flex-col"
      >
        <div class="p-2 border-b border-border flex gap-1">
          <Input
            v-model="newCollectionName"
            class="h-7 text-xs"
            :placeholder="t('collections.newPlaceholder')"
            @keydown.enter="handleCreateCollection"
          />
          <Button
            @click="handleCreateCollection"
            size="icon"
            variant="ghost"
            class="h-7 w-7"
          >
            <Plus class="w-4 h-4" />
          </Button>
        </div>
        <div class="flex-1 overflow-y-auto p-1 space-y-0.5">
          <Button
            @click="activeCollectionId = null"
            variant="ghost"
            size="sm"
            class="w-full justify-start text-xs"
            :class="{ 'bg-accent': activeCollectionId === null }"
          >
            <Hash class="w-3 h-3 mr-2" />
            {{ t("collections.all") }}
          </Button>
          <div
            v-for="collection in collections"
            :key="collection.id"
            class="group flex items-center"
          >
            <Button
              @click="activeCollectionId = collection.id"
              variant="ghost"
              size="sm"
              class="flex-1 justify-start text-xs truncate"
              :class="{ 'bg-accent': activeCollectionId === collection.id }"
            >
              <Folder class="w-3 h-3 mr-2 shrink-0" />
              <span class="truncate">{{ collection.name }}</span>
            </Button>
            <Button
              @click.stop="deleteCollection(collection.id)"
              variant="ghost"
              size="icon"
              class="h-6 w-6 opacity-0 group-hover:opacity-100"
            >
              <X class="w-3 h-3 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        </div>
      </div>

      <!-- List -->
      <div
        class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1"
        @scroll="handleScroll"
      >
        <div
          v-for="(item, index) in filteredHistory"
          :key="item.id || item.timestamp"
          class="group relative rounded-lg border border-transparent hover:bg-accent/50 hover:border-border transition-all cursor-pointer"
          :class="[
            index === selectedIndex
              ? 'bg-accent border-primary/20 selected-item'
              : '',
            config.compact_mode ? 'p-1.5' : 'p-3',
          ]"
          draggable="true"
          @click="pasteItem(item, false)"
          @mouseenter="selectedIndex = index"
        >
          <!-- Content -->
          <div
            class="flex gap-3"
            :class="config.compact_mode ? 'items-center' : 'items-start'"
          >
            <div
              class="rounded-md bg-muted text-muted-foreground shrink-0 relative"
              :class="config.compact_mode ? 'p-1' : 'mt-0.5 p-1.5'"
            >
              <component
                :is="getItemIcon(item)"
                :class="config.compact_mode ? 'w-3.5 h-3.5' : 'w-4 h-4'"
              />
              <div
                v-if="item.is_pinned"
                class="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5 shadow-sm"
              >
                <Pin class="w-2 h-2" />
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <div
                class="flex justify-between items-baseline"
                :class="config.compact_mode ? '' : 'mb-0.5'"
              >
                <div
                  class="flex items-center gap-2"
                  v-if="!config.compact_mode"
                >
                  <span
                    class="text-[10px] font-mono text-muted-foreground opacity-70"
                    >{{ formatTimeAgo(item.timestamp) }}</span
                  >
                  <div
                    v-if="getCollectionName(item.collection_id)"
                    class="flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]"
                  >
                    <Folder class="w-3 h-3" />
                    <span class="max-w-20 truncate">{{
                      getCollectionName(item.collection_id)
                    }}</span>
                  </div>
                  <div
                    v-if="item.html_content"
                    class="flex items-center gap-1 bg-sky-500/10 text-sky-500 px-1.5 py-0.5 rounded text-[10px]"
                    title="HTML"
                  >
                    <Code class="w-3 h-3" />
                    <span class="max-w-[40px] truncate">HTML</span>
                  </div>

                  <span
                    v-if="item.source_app"
                    class="text-[10px] text-muted-foreground/60 truncate max-w-[100px]"
                    :title="item.source_app"
                  >
                    {{ item.source_app }}
                  </span>
                </div>
              </div>
              <div
                v-if="config.compact_mode"
                class="flex items-center justify-between gap-2"
              >
                <div class="flex-1 min-w-0 flex items-center gap-2">
                  <p
                    v-if="item.kind === 'text'"
                    class="text-xs text-foreground line-clamp-1 break-all font-medium flex-1"
                    :class="{
                      'blur-sm group-hover:blur-none transition-all':
                        item.is_sensitive,
                      'text-muted-foreground opacity-80': !!item.note,
                    }"
                  >
                    <HighlightText
                      :text="item.content"
                      :query="searchQuery"
                      :is-regex="searchRegex"
                      :is-case-sensitive="searchCaseSensitive"
                    />
                  </p>
                  <p
                    v-else-if="item.kind === 'file'"
                    class="text-xs text-foreground line-clamp-1 break-all font-medium flex-1"
                  >
                    {{ getFilesList(item.content).length }} Files:
                    {{ getFilesList(item.content)[0] }}
                  </p>
                  <div v-else class="flex items-center gap-2 flex-1">
                    <span class="text-xs text-muted-foreground italic"
                      >[Image]</span
                    >
                  </div>
                </div>

                <div
                  v-if="getCollectionName(item.collection_id)"
                  class="shrink-0 text-primary opacity-70"
                  :title="getCollectionName(item.collection_id)"
                >
                  <Folder class="w-3 h-3" />
                </div>

                <span
                  class="text-[9px] font-mono text-muted-foreground opacity-50 shrink-0"
                  >{{ formatTimeAgo(item.timestamp) }}</span
                >
              </div>
              <template v-else>
                <p
                  v-if="item.note"
                  class="text-sm font-semibold text-foreground mb-0.5"
                >
                  {{ item.note }}
                </p>
                <p
                  v-if="item.kind === 'text'"
                  class="text-sm text-foreground line-clamp-2 break-all font-medium"
                  :class="{
                    'blur-sm group-hover:blur-none transition-all':
                      item.is_sensitive,
                    'text-muted-foreground text-xs': !!item.note,
                  }"
                >
                  <HighlightText
                    :text="item.content"
                    :query="searchQuery"
                    :is-regex="searchRegex"
                    :is-case-sensitive="searchCaseSensitive"
                  />
                </p>
                <div
                  v-else-if="item.kind === 'file'"
                  class="flex flex-col gap-1 mt-1"
                >
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
            class="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm rounded-md p-0.5 shadow-sm border border-border"
            @click.stop
          >
            <Button
              v-if="item.kind !== 'image' && !item.is_sensitive"
              size="icon"
              variant="ghost"
              class="h-6 w-6 text-muted-foreground hover:text-primary"
              :title="t('actions.edit')"
              @click.stop="openEditor(item)"
            >
              <Edit2 class="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              class="h-6 w-6 text-muted-foreground hover:text-primary"
              :class="{ 'text-primary': !!item.note }"
              :title="t('actions.editNote')"
              @click.stop="openEditor(item, true)"
            >
              <NotepadText class="w-3.5 h-3.5" />
            </Button>
            <Button
              v-if="item.source_app"
              @click.stop="addSensitiveApp(item.source_app)"
              size="icon"
              variant="ghost"
              class="h-6 w-6 text-muted-foreground hover:text-destructive"
              :title="t('actions.blockApp', { app: item.source_app })"
            >
              <Ban class="w-3.5 h-3.5" />
            </Button>
            <Button
              @click.stop="itemToAddToCollection = item"
              size="icon"
              variant="ghost"
              class="h-6 w-6 text-muted-foreground hover:text-primary"
              :title="t('actions.addToCollection')"
            >
              <FolderPlus class="w-3.5 h-3.5" />
            </Button>
            <Button
              @click.stop="togglePin(index)"
              size="icon"
              variant="ghost"
              class="h-6 w-6"
              :class="item.is_pinned ? 'text-primary' : 'text-muted-foreground'"
              :title="item.is_pinned ? t('actions.unpin') : t('actions.pin')"
            >
              <component
                :is="item.is_pinned ? PinOff : Pin"
                class="w-3.5 h-3.5"
              />
            </Button>
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

        <div
          v-if="filteredHistory.length === 0"
          class="flex flex-col items-center justify-center h-40 text-muted-foreground"
        >
          <Command class="w-8 h-8 mb-2 opacity-20" />
          <p class="text-sm">{{ t("emptyState.title") }}</p>
          <p class="text-xs opacity-50 mt-1">{{ t("emptyState.subtitle") }}</p>
        </div>
      </div>
    </div>
    <!-- Footer Hint -->
    <div
      class="px-3 py-1.5 bg-card border-t border-border flex justify-between items-center text-[10px] text-muted-foreground font-medium"
    >
      <div class="flex items-center gap-2">
        <span class="flex items-center gap-1"
          ><span class="bg-muted px-1 rounded">↑↓</span>
          {{ t("actions.navigate") }}</span
        >
        <span class="flex items-center gap-1"
          ><span class="bg-muted px-1 rounded">↵</span>
          {{ t("actions.paste") }}</span
        >
        <span class="flex items-center gap-1"
          ><span class="bg-muted px-1 rounded">Space</span>
          {{ t("actions.preview").split(" ")[0] }}</span
        >
      </div>
      <div class="flex items-center gap-1">
        <span>{{ config.shortcut }}</span>
        <div
          v-if="isLoading"
          class="py-4 text-center text-xs text-muted-foreground"
        >
          Loading...
        </div>
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
            <Files v-else-if="previewItem.kind === 'file'" class="w-4 h-4" />
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
          <div v-if="previewItem.kind === 'text'" class="flex flex-col gap-2">
            <div v-if="previewItem.html_content" class="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                class="h-6 text-xs gap-1"
                @click="showHtml = !showHtml"
              >
                <component :is="showHtml ? FileText : Code" class="w-3 h-3" />
                {{ showHtml ? "Text" : "HTML" }}
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
            <pre
              v-else
              class="font-mono text-sm text-foreground whitespace-pre-wrap break-all"
              >{{ previewContent || previewItem.content }}</pre
            >
          </div>
          <div
            v-else-if="previewItem.kind === 'file'"
            class="flex flex-col gap-2"
          >
            <h3 class="font-medium text-sm text-muted-foreground">
              {{ getFilesList(previewItem.content).length }} Files
            </h3>
            <div class="space-y-1">
              <div
                v-for="(file, i) in getFilesList(previewItem.content)"
                :key="i"
                class="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm break-all font-mono"
              >
                <component
                  :is="getFileIcon(file)"
                  class="shrink-0 w-5 h-5 text-muted-foreground"
                />
                {{ file }}
              </div>
            </div>
          </div>
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
            v-if="previewItem.kind === 'image'"
            @click="ocrImage(previewItem!)"
            variant="secondary"
            class="gap-2"
          >
            <ScanText class="w-4 h-4" /> {{ t("actions.ocr") }}
          </Button>
          <Button
            @click="
              pasteItem(previewItem!, false);
              previewItem = null;
            "
            class="gap-2"
          >
            <CornerDownLeft class="w-4 h-4" /> {{ t("actions.paste") }}
          </Button>
        </div>
      </div>
    </div>

    <!-- Clear History Confirmation Dialog -->
    <Dialog v-model:open="showClearConfirm">
      <DialogContent class="w-80">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-destructive">
            <Trash2 class="w-5 h-5" /> {{ t("actions.clearHistory") }}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription class="mb-6">
          {{ t("toast.confirmClearHistory") }}
        </DialogDescription>
        <DialogFooter class="flex gap-3">
          <Button
            @click="
              clearHistory();
              showClearConfirm = false;
            "
            variant="destructive"
            class="flex-1"
          >
            {{ t("actions.delete") }}
          </Button>
          <Button
            @click="showClearConfirm = false"
            variant="secondary"
            class="flex-1"
          >
            {{ t("settings.cancel") }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Settings Dialog -->
    <Dialog v-model:open="showSettings">
      <DialogContent class="w-[800px]! max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <Settings class="w-5 h-5 text-primary" /> {{ t("settings.title") }}
          </DialogTitle>
        </DialogHeader>
        <form @submit="onSubmit">
          <div class="grid grid-cols-2 gap-x-4 gap-y-4 mt-4">
            <!-- Global Shortcut -->
            <FormField
              v-slot="{ componentField }"
              name="shortcut"
              class="col-span-2"
            >
              <FormItem class="col-span-2">
                <FormLabel
                  class="text-xs font-bold text-muted-foreground uppercase tracking-wider"
                >
                  {{ t("settings.globalShortcut") }}
                </FormLabel>
                <FormControl>
                  <div class="relative">
                    <Input
                      readonly
                      :placeholder="t('settings.recordShortcut')"
                      class="cursor-pointer"
                      :model-value="componentField.modelValue"
                      @click="startRecording"
                      @keydown="handleShortcutKeydown"
                      @blur="componentField.onBlur"
                    />
                    <span
                      v-if="isRecording"
                      class="absolute right-3 top-1/2 transform -translate-y-1/2 flex h-2 w-2"
                    >
                      <span
                        class="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"
                      ></span>
                      <span
                        class="relative inline-flex rounded-full h-2 w-2 bg-destructive"
                      ></span>
                    </span>
                  </div>
                </FormControl>
              </FormItem>
            </FormField>

            <!-- History Size -->
            <FormField v-slot="{ componentField }" name="max_history_size">
              <FormItem>
                <FormLabel
                  class="text-xs font-bold text-muted-foreground uppercase tracking-wider"
                >
                  {{ t("settings.historySize") }}
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="5"
                    max="1000"
                    :model-value="componentField.modelValue"
                    @update:model-value="componentField['onUpdate:modelValue']"
                    @blur="componentField.onBlur"
                  />
                </FormControl>
              </FormItem>
            </FormField>

            <!-- Language -->
            <FormField v-slot="{ componentField }" name="language">
              <FormItem>
                <FormLabel
                  class="text-xs font-bold text-muted-foreground uppercase tracking-wider"
                >
                  {{ t("settings.language") }}
                </FormLabel>
                <FormControl>
                  <Select v-bind="componentField">
                    <SelectTrigger class="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        {{ t("settings.languageAuto") }}
                      </SelectItem>
                      <SelectItem value="en">{{
                        t("settings.languageEn")
                      }}</SelectItem>
                      <SelectItem value="zh"
                        >{{ t("settings.languageZh") }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            </FormField>

            <!-- Theme -->
            <FormField v-slot="{ componentField }" name="theme">
              <FormItem>
                <FormLabel
                  class="text-xs font-bold text-muted-foreground uppercase tracking-wider"
                >
                  {{ t("settings.theme") }}
                </FormLabel>
                <FormControl>
                  <Select v-bind="componentField">
                    <SelectTrigger class="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{{
                        t("settings.themeAuto")
                      }}</SelectItem>
                      <SelectItem value="light">
                        {{ t("settings.themeLight") }}
                      </SelectItem>
                      <SelectItem value="dark">{{
                        t("settings.themeDark")
                      }}</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            </FormField>
            <!-- Compact Mode -->
            <FormField v-slot="componentField" name="compact_mode">
              <FormItem class="flex flex-col">
                <FormLabel class="text-sm font-medium">
                  {{ t("settings.compactMode") }}
                </FormLabel>
                <FormControl>
                  <Switch
                    :model-value="componentField.value"
                    @update:model-value="componentField.handleChange"
                  />
                </FormControl>
              </FormItem>
            </FormField>

            <!-- Sensitive Apps -->
            <div class="col-span-2">
              <label
                class="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block"
              >
                {{ t("settings.sensitiveApps") }}
              </label>
              <div class="space-y-2">
                <div class="flex gap-2">
                  <Input
                    v-model="newAppInput"
                    :placeholder="t('settings.appNamePlaceholder')"
                    @keydown.enter="addSensitiveApp"
                  />
                  <Button
                    @click="addSensitiveApp"
                    type="button"
                    size="icon"
                    variant="secondary"
                    class="shrink-0"
                  >
                    <Plus class="w-4 h-4" />
                  </Button>
                </div>
                <div
                  class="max-h-32 overflow-y-auto custom-scrollbar space-y-1"
                >
                  <div
                    v-for="app in form.values.sensitive_apps"
                    :key="app"
                    class="flex items-center justify-between bg-muted/50 px-3 py-1.5 rounded text-sm"
                  >
                    <span class="truncate">{{ app }}</span>
                    <button
                      @click="removeSensitiveApp(app)"
                      type="button"
                      class="text-muted-foreground hover:text-destructive transition-colors ml-2"
                    >
                      <X class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Clear Pinned on Clear -->
            <FormField v-slot="componentField" name="clear_pinned_on_clear">
              <FormItem class="flex flex-col">
                <FormLabel class="text-sm font-medium">
                  清除时包含置顶项
                </FormLabel>
                <FormControl>
                  <Switch
                    :model-value="componentField.value"
                    @update:model-value="componentField.handleChange"
                  />
                </FormControl>
                <FormDescription class="text-xs">
                  开启后清空历史时会同时清除置顶的项目
                </FormDescription>
              </FormItem>
            </FormField>

            <!-- Clear Collected on Clear -->
            <FormField v-slot="componentField" name="clear_collected_on_clear">
              <FormItem class="flex flex-col">
                <FormLabel class="text-sm font-medium">
                  清除时包含收藏项
                </FormLabel>
                <FormControl>
                  <Switch
                    :model-value="componentField.value"
                    @update:model-value="componentField.handleChange"
                  />
                </FormControl>
                <FormDescription class="text-xs">
                  开启后清空历史时会同时清除已收藏的项目
                </FormDescription>
              </FormItem>
            </FormField>

            <!-- Start at Login -->
            <div class="col-span-2">
              <div class="flex items-center justify-between py-2">
                <label class="text-sm font-medium text-foreground">
                  {{ t("settings.startAtLogin") }}
                </label>
                <Switch
                  :checked="isAutoStart"
                  @update:checked="toggleAutoStart"
                />
              </div>
            </div>
          </div>
          <DialogFooter class="flex gap-3 mt-8">
            <Button type="submit" class="flex-1">
              {{ t("settings.save") }}
            </Button>
            <Button
              type="button"
              @click="showSettings = false"
              variant="secondary"
              class="flex-1"
            >
              {{ t("settings.cancel") }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <!-- Collection Selector Modal -->
    <div
      v-if="itemToAddToCollection"
      class="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      @click.self="itemToAddToCollection = null"
    >
      <div
        class="bg-card rounded-xl shadow-2xl border border-border max-w-sm w-full flex flex-col overflow-hidden"
      >
        <div
          class="p-4 border-b border-border flex justify-between items-center"
        >
          <h3 class="font-medium text-sm">
            {{ t("actions.addToCollection") }}
          </h3>
          <Button
            @click="itemToAddToCollection = null"
            size="icon"
            variant="ghost"
            class="h-6 w-6"
          >
            <X class="w-4 h-4" />
          </Button>
        </div>
        <div class="p-2 overflow-y-auto max-h-[300px] space-y-1">
          <Button
            @click="handleAddToCollection(null)"
            variant="ghost"
            size="sm"
            class="w-full justify-start text-xs"
            :class="{
              'bg-accent': itemToAddToCollection.collection_id === null,
            }"
          >
            <X class="w-3 h-3 mr-2" />
            {{ t("collections.removeFromCollection") }}
          </Button>
          <Button
            v-for="collection in collections"
            :key="collection.id"
            @click="handleAddToCollection(collection.id)"
            variant="ghost"
            size="sm"
            class="w-full justify-start text-xs"
            :class="{
              'bg-accent':
                itemToAddToCollection.collection_id === collection.id,
            }"
          >
            <Folder class="w-3 h-3 mr-2" />
            {{ collection.name }}
          </Button>
        </div>
      </div>
    </div>
    <ItemEditorDialog
      :open="showItemEditor"
      :item="editingItem"
      :note-only="editingNoteOnly"
      @update:open="showItemEditor = $event"
      @save="handleEditorSave"
    />
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
