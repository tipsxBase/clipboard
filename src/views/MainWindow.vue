<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useI18n } from 'vue-i18n';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { useForm } from 'vee-validate';
import {
  Search,
  Settings,
  Minus,
  Square,
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
  Folder,
  FolderPlus,
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
  Camera,
  ArrowUpDown,
  Clock,
  Scissors,
  Zap,
  ChevronDown,
  ChevronRight,
  Star,
  Heart,
  Bookmark,
  Tag,
  Box,
  Briefcase,
  Home,
  Palette,
  Power,
} from 'lucide-vue-next';
import DOMPurify from 'dompurify';
import Button from '@/components/ui/button/Button.vue';
import Input from '@/components/ui/input/Input.vue';
import { Switch } from '@/components/ui/switch';
import { FormControl, FormField, FormItem, FormLabel, FormDescription } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { useClipboard } from '@/composables/useClipboard';
import { useSettings } from '@/composables/useSettings';
import { useToast } from '@/composables/useToast';
import { useTimeAgo } from '@/composables/useTimeAgo';
import type { ClipboardItem, Collection } from '@/types';
import {
  Dialog,
  DialogHeader,
  DialogDescription,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import LocalImage from '@/components/LocalImage.vue';
import Select from '@/components/ui/select/Select.vue';
import SelectTrigger from '@/components/ui/select/SelectTrigger.vue';
import SelectValue from '@/components/ui/select/SelectValue.vue';
import SelectContent from '@/components/ui/select/SelectContent.vue';
import SelectItem from '@/components/ui/select/SelectItem.vue';
import SelectGroup from '@/components/ui/select/SelectGroup.vue';
import SelectLabel from '@/components/ui/select/SelectLabel.vue';
import SelectSeparator from '@/components/ui/select/SelectSeparator.vue';
import ItemEditorDialog from '@/components/ItemEditorDialog.vue';
import HighlightText from '@/components/HighlightText.vue';
import QuickActionMenu from '@/components/QuickActionMenu.vue';
import RuleEditor from '@/components/RuleEditor.vue';
import { useRules } from '@/composables/useRules';
import { confirm } from '@/composables/useConfirm';
import type { Rule } from '@/types';

// Props for update notification
const props = defineProps<{
  updateInfo: { version: string; current_version: string } | null;
  currentVersion: string;
  isReadyToRestart: boolean;
}>();

const emit = defineEmits<{
  (e: 'open-update-dialog'): void;
}>();

const { t } = useI18n();
const { toastMessage, showToast } = useToast();
const { formatTimeAgo } = useTimeAgo();
const currentWindow = getCurrentWindow();
const isMacPlatform = ref(false);

const handleScreenshot = async () => {
  try {
    await invoke('start_capture');
  } catch (e) {
    console.error('Screenshot error:', e);
    showToast(String(e));
  }
};

const {
  collections,
  totalCount,
  searchQuery,
  searchRegex,
  searchCaseSensitive,
  selectedIndex,
  activeFilter,
  currentCollectionView,
  activeCollectionId,
  openHistoryView,
  openAllCollectionsView,
  openCollectionView,
  previewItem,
  previewContent,
  filteredHistory,
  loadHistory,
  loadCollections,
  createCollection,
  deleteCollection,
  updateCollection,
  setItemCollection,
  pasteItem,
  deleteItem,
  toggleSensitive,
  togglePin,
  toggleSnippet,
  clearHistory,
  scrollToSelected,
  setupClipboardListeners,
  loadMore,
  isLoading,
  hasMore,
  ocrImage,
  updateItemContent,
  addItem,
  timeRange,
  sortMode,
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

const getCollection = (id?: number | null) => {
  if (!id) return null;
  return collections.value.find((collection) => collection.id === id) || null;
};

const getCollectionName = (id?: number) => getCollection(id)?.name;

function shouldShowCollectionBadge(item: ClipboardItem) {
  return currentCollectionView.value !== 'collection_detail' && !!getCollection(item.collection_id);
}

const totalCollectedCount = computed(() =>
  collections.value.reduce((sum, collection) => sum + (collection.item_count || 0), 0)
);

const currentCollection = computed(() =>
  currentCollectionView.value === 'collection_detail'
    ? collections.value.find((collection) => collection.id === activeCollectionId.value) || null
    : null
);

const currentCollectionFilterValue = computed(() => {
  if (currentCollectionView.value === 'all_collections') return 'all_collections';
  if (currentCollectionView.value === 'collection_detail' && activeCollectionId.value !== null) {
    return `collection:${activeCollectionId.value}`;
  }
  return 'history';
});

const currentCollectionFilterLabel = computed(() => {
  if (currentCollectionView.value === 'all_collections') {
    return t('collections.allCollections');
  }

  if (currentCollectionView.value === 'collection_detail') {
    return currentCollection.value?.name || t('collections.allCollections');
  }

  return t('collections.all');
});

const currentCollectionViewTitle = computed(() => {
  if (currentCollectionView.value === 'all_collections') {
    return t('collections.allCollections');
  }

  if (currentCollectionView.value === 'collection_detail') {
    return currentCollection.value?.name || t('collections.allCollections');
  }

  return t('collections.allHistory');
});
const hasActiveHistoryFilters = computed(
  () =>
    !!searchQuery.value ||
    activeFilter.value !== 'all' ||
    !!timeRange.value ||
    !!searchRegex.value ||
    !!searchCaseSensitive.value
);

const emptyStateTitle = computed(() => {
  if (hasActiveHistoryFilters.value) {
    return t('emptyState.title');
  }

  if (currentCollectionView.value === 'all_collections') {
    return t('emptyState.allCollectionsTitle');
  }

  if (currentCollectionView.value === 'collection_detail') {
    return t('emptyState.collectionTitle', {
      name: currentCollection.value?.name || currentCollectionViewTitle.value,
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

function detectPlatform() {
  const source = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  isMacPlatform.value = source.includes('mac');
}

async function startWindowDrag(event: MouseEvent) {
  if (event.button !== 0) return;
  try {
    await currentWindow.startDragging();
  } catch (error) {
    console.error('Failed to start window dragging:', error);
  }
}

async function minimizeWindow() {
  try {
    await currentWindow.minimize();
  } catch (error) {
    console.error('Failed to minimize window:', error);
  }
}

async function toggleWindowMaximize() {
  try {
    await currentWindow.toggleMaximize();
  } catch (error) {
    console.error('Failed to toggle maximize:', error);
  }
}

async function closeWindow() {
  try {
    await currentWindow.close();
  } catch (error) {
    console.error('Failed to close window:', error);
  }
}

function handleTitlebarDoubleClick() {
  if (!isMacPlatform.value) {
    void toggleWindowMaximize();
  }
}

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
  tempScreenshotShortcut,
  tempMaxSize,
  tempLanguage,
  tempTheme,
  tempCompactMode,
  tempClearPinnedOnClear,
  tempClearCollectedOnClear,
  tempScreenshotFormat,
  tempScreenshotQuality,
  tempScreenshotSaveAction,
  isRecording,
  isRecordingScreenshotShortcut,
  isPaused,
  isAutoStart,
  loadConfig,
  saveConfig,
  openSettings,
  toggleAutoStart,
  togglePause,
  setupConfigListeners,
} = useSettings();

const { rules, loadRules, addRule, updateRule, deleteRule, toggleRuleEnabled } = useRules();

const showRules = ref(false);
const editingRuleData = ref<Rule | null>(null);
const showRuleEditor = ref(false);

// Toggle shortcut recording
function toggleShortcutRecording() {
  if (isRecording.value) {
    isRecording.value = false;
    tempShortcut.value = config.value.shortcut;
    invoke('set_recording_shortcut', { isRecording: false }).catch(console.error);
  } else {
    // 先取消另一个录制
    if (isRecordingScreenshotShortcut.value) {
      isRecordingScreenshotShortcut.value = false;
      tempScreenshotShortcut.value = config.value.screenshot_shortcut || 'CommandOrControl+Shift+S';
      invoke('set_recording_screenshot_shortcut', { isRecording: false }).catch(console.error);
    }
    isRecording.value = true;
    tempShortcut.value = t('settings.recording');
    invoke('set_recording_shortcut', { isRecording: true }).catch(console.error);
  }
}

// Toggle screenshot shortcut recording
function toggleScreenshotShortcutRecording() {
  if (isRecordingScreenshotShortcut.value) {
    isRecordingScreenshotShortcut.value = false;
    tempScreenshotShortcut.value = config.value.screenshot_shortcut || 'CommandOrControl+Shift+S';
    invoke('set_recording_screenshot_shortcut', { isRecording: false }).catch(console.error);
  } else {
    // 先取消另一个录制
    if (isRecording.value) {
      isRecording.value = false;
      tempShortcut.value = config.value.shortcut;
      invoke('set_recording_shortcut', { isRecording: false }).catch(console.error);
    }
    isRecordingScreenshotShortcut.value = true;
    tempScreenshotShortcut.value = t('settings.recording');
    invoke('set_recording_screenshot_shortcut', { isRecording: true }).catch(console.error);
  }
}

// Track which items have their quick action menu open
const openMenuItems = reactive(new Set<number>());

function handleMenuOpen(itemId: number, isOpen: boolean) {
  if (isOpen) {
    openMenuItems.add(itemId);
  } else {
    openMenuItems.delete(itemId);
  }
}

function isMenuOpen(itemId: number) {
  return openMenuItems.has(itemId);
}

function openRuleEditor(rule?: Rule) {
  editingRuleData.value = rule || null;
  showRuleEditor.value = true;
}

async function handleRuleSave(rule: Rule) {
  if (editingRuleData.value) {
    await updateRule(rule);
  } else {
    await addRule(rule);
  }
  showRuleEditor.value = false;
  editingRuleData.value = null;
}

async function handleRuleDelete(id: string) {
  await deleteRule(id);
  showRuleEditor.value = false;
  editingRuleData.value = null;
}

const showItemEditor = ref(false);
const editingItem = ref<ClipboardItem | null>(null);
const editingNoteOnly = ref(false);
const showHtml = ref(false);
const linkedScreenshot = ref<ClipboardItem | null>(null);

watch(previewItem, async (newItem) => {
  showHtml.value = !!newItem?.html_content;
  editingNoteOnly.value = false;
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
    updateItemContent(data.id, data.content, data.dataType, data.note, data.html_content);
  } else {
    addItem(data.content);
  }
}

// Form schema
const formSchema = toTypedSchema(
  z.object({
    shortcut: z.string().min(1, 'Shortcut is required'),
    screenshot_shortcut: z.string(),
    max_history_size: z.number().min(5).max(1000),
    language: z.string(),
    theme: z.string(),
    compact_mode: z.boolean(),
    clear_pinned_on_clear: z.boolean(),
    clear_collected_on_clear: z.boolean(),
    screenshot_format: z.enum(['png', 'jpeg', 'webp']),
    screenshot_quality: z.number().min(1).max(100),
    screenshot_save_action: z.enum(['clipboard', 'file', 'both']),
  })
);

const form = useForm({
  validationSchema: formSchema,
  initialValues: {
    shortcut: tempShortcut.value,
    screenshot_shortcut: tempScreenshotShortcut.value,
    max_history_size: tempMaxSize.value,
    language: tempLanguage.value,
    theme: tempTheme.value,
    compact_mode: tempCompactMode.value,
    clear_pinned_on_clear: tempClearPinnedOnClear.value,
    clear_collected_on_clear: tempClearCollectedOnClear.value,
    screenshot_format: tempScreenshotFormat.value,
    screenshot_quality: tempScreenshotQuality.value,
    screenshot_save_action: tempScreenshotSaveAction.value,
  },
});

const onSubmit = form.handleSubmit(async (values) => {
  tempShortcut.value = values.shortcut;
  tempScreenshotShortcut.value = values.screenshot_shortcut;
  tempMaxSize.value = values.max_history_size;
  tempLanguage.value = values.language;
  tempTheme.value = values.theme;
  tempCompactMode.value = values.compact_mode;
  tempClearPinnedOnClear.value = values.clear_pinned_on_clear;
  tempClearCollectedOnClear.value = values.clear_collected_on_clear;
  tempScreenshotFormat.value = values.screenshot_format;
  tempScreenshotQuality.value = values.screenshot_quality;
  tempScreenshotSaveAction.value = values.screenshot_save_action;
  await saveConfig();
});

// Watch showSettings to reset form values when opened
watch(showSettings, (isOpen) => {
  if (isOpen) {
    form.resetForm({
      values: {
        shortcut: tempShortcut.value,
        screenshot_shortcut: tempScreenshotShortcut.value,
        max_history_size: tempMaxSize.value,
        language: tempLanguage.value,
        theme: tempTheme.value,
        compact_mode: tempCompactMode.value,
        clear_pinned_on_clear: tempClearPinnedOnClear.value,
        clear_collected_on_clear: tempClearCollectedOnClear.value,
        screenshot_format: tempScreenshotFormat.value,
        screenshot_quality: tempScreenshotQuality.value,
        screenshot_save_action: tempScreenshotSaveAction.value,
      },
    });
  }
});

const showClearConfirm = ref(false);
const showCollectionsManager = ref(false);
const newCollectionName = ref('');
const itemToAddToCollection = ref<ClipboardItem | null>(null);
const currentItemCollection = computed(() =>
  itemToAddToCollection.value ? getCollection(itemToAddToCollection.value.collection_id) : null
);
const collectionDialogTitle = computed(() =>
  itemToAddToCollection.value?.collection_id
    ? t('actions.moveToCollection')
    : t('actions.addToCollection')
);

async function handleCreateCollection() {
  if (newCollectionName.value.trim()) {
    const collection = await createCollection(newCollectionName.value.trim());
    if (collection) {
      openCollectionView(collection.id);
      showCollectionsManager.value = false;
    }
    newCollectionName.value = '';
  }
}

function updateCollectionFilter(value: string) {
  if (value === 'history') {
    openHistoryView();
    return;
  }

  if (value === 'all_collections') {
    openAllCollectionsView();
    return;
  }

  if (value.startsWith('collection:')) {
    const id = Number(value.split(':')[1]);
    if (!Number.isNaN(id)) {
      openCollectionView(id);
    }
  }
}

async function handleAddToCollection(collectionId: number | null) {
  if (itemToAddToCollection.value && itemToAddToCollection.value.id) {
    await setItemCollection(itemToAddToCollection.value.id, collectionId);
    itemToAddToCollection.value = null;
  }
}

async function handleItemActionDone() {
  await loadCollections();
  await loadHistory(true);
}

// Collection editor state
const showCollectionEditor = ref(false);
const editingCollection = ref<Collection | null>(null);
const editingCollectionName = ref('');
const editingCollectionIcon = ref('folder');
const editingCollectionColor = ref('');

// Collection icon options
const collectionIcons = [
  { name: 'folder', icon: Folder },
  { name: 'star', icon: Star },
  { name: 'heart', icon: Heart },
  { name: 'bookmark', icon: Bookmark },
  { name: 'tag', icon: Tag },
  { name: 'box', icon: Box },
  { name: 'briefcase', icon: Briefcase },
  { name: 'home', icon: Home },
];

// Collection color options
const collectionColors = [
  '', // Default
  '#FF5733',
  '#33FF57',
  '#3357FF',
  '#FF33F5',
  '#F5FF33',
  '#33FFF5',
  '#FF8C33',
  '#8C33FF',
];

function getCollectionIconComponent(iconName?: string) {
  const icon = collectionIcons.find((i) => i.name === iconName);
  return icon?.icon || Folder;
}

function getRuleActionLabel(rule: Rule) {
  return t(`rules.actionType.${rule.action.action_type}`);
}

function getRuleTargetCollection(rule: Rule) {
  if (rule.action.action_type !== 'add_to_collection') return null;
  return getCollection(rule.action.collection_id);
}

function openCollectionEditor(collection: Collection) {
  editingCollection.value = collection;
  editingCollectionName.value = collection.name;
  editingCollectionIcon.value = collection.icon || 'folder';
  editingCollectionColor.value = collection.color || '';
  showCollectionEditor.value = true;
}

async function handleSaveCollection() {
  if (!editingCollection.value || !editingCollectionName.value.trim()) return;
  await updateCollection(
    editingCollection.value.id,
    editingCollectionName.value.trim(),
    editingCollectionIcon.value,
    editingCollectionColor.value
  );
  showCollectionEditor.value = false;
  editingCollection.value = null;
}

async function handleDeleteCollection(collection: Collection) {
  const confirmed = await confirm({
    title: t('collections.deleteConfirmTitle'),
    description: t('collections.deleteConfirmDescription', { name: collection.name }),
    actionText: t('deleteDialog.actionText'),
    cancelText: t('deleteDialog.cancelText'),
    variant: 'destructive',
  });
  if (!confirmed) return;

  await deleteCollection(collection.id);
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
  if (item.kind === 'image') return ImageIcon;

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

function getFilterIcon(filter: string) {
  switch (filter) {
    case 'text':
      return FileText;
    case 'image':
      return ImageIcon;
    case 'file':
      return Files;
    case 'sensitive':
      return Lock;
    case 'snippet':
      return Scissors;
    case 'url':
      return Globe;
    case 'email':
      return Mail;
    case 'code':
      return Code;
    case 'phone':
      return Phone;
    default:
      return null;
  }
}

const filterOptions = [
  'all',
  'text',
  'image',
  'file',
  'sensitive',
  'snippet',
  'url',
  'email',
  'code',
  'phone',
] as const;

const currentFilterIcon = computed(() => getFilterIcon(activeFilter.value));
const currentFilterLabel = computed(() => t(`filters.${activeFilter.value}`));
const timeRangeOptions = computed(() => [
  { value: 'all', label: t('timeRange.all') },
  { value: 'today', label: t('timeRange.today') },
  { value: 'yesterday', label: t('timeRange.yesterday') },
  { value: 'week', label: t('timeRange.week') },
  { value: 'month', label: t('timeRange.month') },
]);
const currentTimeRangeLabel = computed(
  () =>
    timeRangeOptions.value.find((option) => option.value === (timeRange.value ?? 'all'))?.label ??
    t('timeRange.all')
);

function handleKeydown(e: KeyboardEvent) {
  // 录制快捷键时，不处理导航事件
  if (isRecording.value || isRecordingScreenshotShortcut.value) {
    e.preventDefault();
    e.stopPropagation();

    const modifiers = [];
    if (e.metaKey) modifiers.push('CommandOrControl');
    if (e.ctrlKey) modifiers.push('Control');
    if (e.altKey) modifiers.push('Alt');
    if (e.shiftKey) modifiers.push('Shift');

    let key = e.key.toUpperCase();

    const keyMap: Record<string, string> = {
      ' ': 'Space',
      ARROWUP: 'Up',
      ARROWDOWN: 'Down',
      ARROWLEFT: 'Left',
      ARROWRIGHT: 'Right',
      ENTER: 'Return',
      ESCAPE: 'Escape',
      BACKSPACE: 'Backspace',
      TAB: 'Tab',
    };

    if (keyMap[key]) {
      key = keyMap[key];
    }

    // ESC 取消录制
    if (key === 'ESCAPE') {
      if (isRecording.value) {
        isRecording.value = false;
        tempShortcut.value = config.value.shortcut;
        invoke('set_recording_shortcut', { isRecording: false }).catch(console.error);
      }
      if (isRecordingScreenshotShortcut.value) {
        isRecordingScreenshotShortcut.value = false;
        tempScreenshotShortcut.value =
          config.value.screenshot_shortcut || 'CommandOrControl+Shift+S';
        invoke('set_recording_screenshot_shortcut', { isRecording: false }).catch(console.error);
      }
      return;
    }

    // 如果只是修饰键，不结束录制，只显示当前组合
    if (['META', 'CONTROL', 'ALT', 'SHIFT'].includes(key)) {
      if (isRecording.value) {
        tempShortcut.value = modifiers.join('+') + ' + ...';
      } else if (isRecordingScreenshotShortcut.value) {
        tempScreenshotShortcut.value = modifiers.join('+') + ' + ...';
      }
      return;
    }

    // 完成录制
    const shortcut = [...modifiers, key].join('+');
    if (isRecording.value) {
      tempShortcut.value = shortcut;
      isRecording.value = false;
      invoke('set_recording_shortcut', { isRecording: false }).catch(console.error);
    } else if (isRecordingScreenshotShortcut.value) {
      tempScreenshotShortcut.value = shortcut;
      isRecordingScreenshotShortcut.value = false;
      invoke('set_recording_screenshot_shortcut', { isRecording: false }).catch(console.error);
    }
    return;
  }

  // Ignore keydown events coming from input elements or when dialogs are open
  const target = e.target as HTMLElement;
  const isInput = ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable;
  const isDialogGiven = showSettings.value || showItemEditor.value;

  if ((isInput || isDialogGiven) && e.key !== 'Escape') return;

  const len = filteredHistory.value.length;
  if (len === 0 && e.key !== 'Escape') return;

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
    if (filteredHistory.value[selectedIndex.value]) {
      pasteItem(filteredHistory.value[selectedIndex.value], false);
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
    } else if (showSettings.value) {
      showSettings.value = false;
    } else {
      getCurrentWindow().hide();
    }
  }
}

onMounted(async () => {
  detectPlatform();
  await loadConfig();
  await loadHistory(true);
  await loadCollections();
  await loadRules();
  await setupClipboardListeners();
  await setupConfigListeners();
  window.addEventListener('keydown', handleKeydown);

  // Listen for rule-applied events
  await listen(
    'rule-applied',
    (event: { payload: { rule?: string; rules?: string[]; action: string } }) => {
      // Handle both single rule (ignore) and multiple rules (modify) formats
      const name = event.payload.rule || (event.payload.rules && event.payload.rules[0]) || '';
      if (name) {
        showToast(
          t('rules.ruleApplied', {
            name,
            action: event.payload.action,
          })
        );
      }
    }
  );

  // Listen for screenshot errors (from global shortcut path)
  await listen('screenshot-error', (event: { payload: string }) => {
    showToast(event.payload);
  });

  // Focus search on show
  await listen('tauri://focus', async () => {
    await loadCollections();
    await loadHistory(true);
  });
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="app-shell flex flex-col">
    <div
      class="app-titlebar"
      @mousedown="startWindowDrag"
      @dblclick="handleTitlebarDoubleClick"
    >
      <div v-if="isMacPlatform" class="app-titlebar-mac-controls">
        <button
          type="button"
          class="app-titlebar-dot app-titlebar-dot-close"
          :title="t('actions.close')"
          @mousedown.stop
          @click="closeWindow"
        />
        <button
          type="button"
          class="app-titlebar-dot app-titlebar-dot-minimize"
          :title="t('actions.minimize')"
          @mousedown.stop
          @click="minimizeWindow"
        />
        <button
          type="button"
          class="app-titlebar-dot app-titlebar-dot-maximize"
          :title="t('actions.maximize')"
          @mousedown.stop
          @click="toggleWindowMaximize"
        />
      </div>

      <div class="app-titlebar-brand">Clipboard</div>
      <div class="app-titlebar-drag" />

      <div class="flex items-center gap-1 shrink-0">
        <Button
          @click="showCollectionsManager = true"
          size="icon"
          variant="ghost"
          class="app-titlebar-action"
          :title="t('actions.collections')"
          @mousedown.stop
        >
          <Folder class="w-3.5 h-3.5" />
        </Button>
        <Button
          @click="openEditor(null)"
          size="icon"
          variant="ghost"
          class="app-titlebar-action"
          :title="t('actions.addItem')"
          @mousedown.stop
        >
          <Plus class="w-3.5 h-3.5" />
        </Button>
        <Button
          @click="handleScreenshot"
          size="icon"
          variant="ghost"
          class="app-titlebar-action"
          title="Screenshot"
          @mousedown.stop
        >
          <Camera class="w-3.5 h-3.5" />
        </Button>
        <Button
          @click="togglePause"
          size="icon"
          variant="ghost"
          class="app-titlebar-action"
          :class="{
            'border-yellow-500/25 bg-yellow-500/10 text-yellow-700 hover:border-yellow-500/30 hover:bg-yellow-500/15 dark:text-yellow-300':
              isPaused,
          }"
          :title="isPaused ? t('actions.resumeRecording') : t('actions.pauseRecording')"
          @mousedown.stop
        >
          <component :is="isPaused ? Play : Pause" class="w-3.5 h-3.5" />
        </Button>
        <Button
          @click="openSettings"
          size="icon"
          variant="ghost"
          class="app-titlebar-action"
          :title="t('actions.settings')"
          @mousedown.stop
        >
          <Settings class="w-3.5 h-3.5" />
        </Button>
        <Button
          @click="showClearConfirm = true"
          size="icon"
          variant="ghost"
          class="app-titlebar-action hover:text-destructive"
          :title="t('actions.clearHistory')"
          @mousedown.stop
        >
          <Trash2 class="w-3.5 h-3.5" />
        </Button>
      </div>

      <div v-if="!isMacPlatform" class="app-titlebar-window-controls">
        <button
          type="button"
          class="app-window-control"
          :title="t('actions.minimize')"
          @mousedown.stop
          @click="minimizeWindow"
        >
          <Minus class="h-3 w-3" />
        </button>
        <button
          type="button"
          class="app-window-control"
          :title="t('actions.maximize')"
          @mousedown.stop
          @click="toggleWindowMaximize"
        >
          <Square class="h-3 w-3" />
        </button>
        <button
          type="button"
          class="app-window-control app-window-control-close"
          :title="t('actions.close')"
          @mousedown.stop
          @click="closeWindow"
        >
          <X class="h-3 w-3" />
        </button>
      </div>
    </div>

    <!-- Header -->
    <div class="app-header space-y-3">
      <div class="relative flex items-center">
        <div class="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3">
          <Search class="h-4 w-4 text-muted-foreground" />
        </div>
        <Input
          v-model="searchQuery"
          class="w-full"
          input-class="app-toolbar-input pl-10 pr-18"
          :placeholder="t('searchPlaceholder')"
        />
        <div class="absolute inset-y-0 right-1.5 z-10 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            class="app-search-toggle"
            :class="{ 'app-toolbar-button-active': searchCaseSensitive }"
            @click="searchCaseSensitive = !searchCaseSensitive"
            :title="t('search.matchCase') || 'Match Case'"
          >
            <CaseSensitive class="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="app-search-toggle"
            :class="{ 'app-toolbar-button-active': searchRegex }"
            @click="searchRegex = !searchRegex"
            :title="t('search.regex') || 'Use Regular Expression'"
          >
            <Regex class="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto no-scrollbar">
          <Select
            :model-value="activeFilter"
            @update:model-value="(v) => (activeFilter = String(v) as any)"
          >
            <SelectTrigger
              size="xs"
              class="min-w-[132px] shrink-0 rounded-lg border-border bg-card px-2.5 text-[10px] shadow-none"
            >
              <div class="flex min-w-0 items-center gap-2">
                <component
                  :is="currentFilterIcon"
                  v-if="currentFilterIcon"
                  class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                />
                <span class="truncate font-medium">{{ currentFilterLabel }}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="filter in filterOptions" :key="filter" :value="filter">
                <div class="flex items-center gap-2">
                  <component
                    :is="getFilterIcon(filter)"
                    v-if="getFilterIcon(filter)"
                    class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  />
                  <span>{{ t(`filters.${filter}`) }}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            :model-value="currentCollectionFilterValue"
            @update:model-value="(v) => updateCollectionFilter(String(v))"
          >
            <SelectTrigger
              size="xs"
              class="min-w-[156px] shrink-0 rounded-lg border-border bg-card px-2.5 text-[10px] shadow-none"
            >
              <div class="flex min-w-0 items-center gap-2">
                <Folder class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span class="truncate font-medium">{{ currentCollectionFilterLabel }}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{{ t('collections.scope') }}</SelectLabel>
                <SelectItem value="history">{{ t('collections.all') }}</SelectItem>
                <SelectItem value="all_collections">{{ t('collections.allCollections') }}</SelectItem>
              </SelectGroup>
              <SelectSeparator v-if="collections.length > 0" />
              <SelectGroup v-if="collections.length > 0">
                <SelectLabel>{{ t('collections.saved') }}</SelectLabel>
                <SelectItem
                  v-for="collection in collections"
                  :key="collection.id"
                  :value="`collection:${collection.id}`"
                >
                  {{ collection.name }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select
            :model-value="timeRange ?? 'all'"
            @update:model-value="(v) => (timeRange = String(v) === 'all' ? null : String(v))"
          >
            <SelectTrigger
              size="xs"
              class="min-w-[116px] shrink-0 rounded-lg border-border bg-card px-2.5 text-[10px] shadow-none"
            >
              <div class="flex min-w-0 items-center gap-1.5">
                <Clock class="h-3 w-3 shrink-0 text-muted-foreground" />
                <span class="truncate font-medium">{{ currentTimeRangeLabel }}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="range in timeRangeOptions" :key="range.value" :value="range.value">
                {{ range.label }}
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            :model-value="sortMode ?? 'recent'"
            @update:model-value="(v) => (sortMode = String(v) === 'recent' ? null : String(v))"
          >
            <SelectTrigger
              size="xs"
              class="min-w-[104px] shrink-0 rounded-lg border-border bg-card px-2.5 text-[10px] shadow-none"
            >
              <ArrowUpDown class="mr-1 h-3 w-3 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">{{ t('sort.recent') }}</SelectItem>
              <SelectItem value="oldest">{{ t('sort.oldest') }}</SelectItem>
              <SelectItem value="source_app">{{ t('sort.sourceApp') }}</SelectItem>
            </SelectContent>
          </Select>

        </div>
        <div
          class="shrink-0 rounded-full border border-border/80 bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
        >
          {{ totalCount }} {{ t('stats.items') }}
        </div>
      </div>
    </div>

    <div class="flex-1 flex overflow-hidden">
      <!-- List -->
      <div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1" @scroll="handleScroll">
        <div
          v-for="(item, index) in filteredHistory"
          :key="item.id || item.timestamp"
          class="group relative app-list-item cursor-pointer hover:border-transparent hover:bg-accent/70"
          :class="[
            index === selectedIndex ? 'app-list-item-active selected-item' : '',
            config.compact_mode ? 'p-1.5' : 'p-3',
          ]"
          draggable="true"
          @click="pasteItem(item, false)"
          @mouseenter="selectedIndex = index"
        >
          <!-- Content -->
          <div class="flex gap-3" :class="config.compact_mode ? 'items-center' : 'items-start'">
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
                <div class="flex items-center gap-2" v-if="!config.compact_mode">
                  <span class="text-[10px] font-mono text-muted-foreground opacity-70">{{
                    formatTimeAgo(item.timestamp)
                  }}</span>
                  <div
                    v-if="shouldShowCollectionBadge(item)"
                    class="flex items-center gap-1 rounded-md border border-primary/15 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                  >
                    <component
                      :is="getCollectionIconComponent(getCollection(item.collection_id)?.icon)"
                      class="h-3 w-3"
                      :style="{ color: getCollection(item.collection_id)?.color || 'currentColor' }"
                    />
                    <span class="max-w-24 truncate">{{
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
              <div v-if="config.compact_mode" class="flex items-center justify-between gap-2">
                <div class="flex-1 min-w-0 flex items-center gap-2">
                  <p
                    v-if="item.kind === 'text'"
                    class="text-xs text-foreground line-clamp-1 break-all font-medium flex-1"
                    :class="{
                      'blur-sm group-hover:blur-none transition-all': item.is_sensitive,
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
                    <span class="text-xs text-muted-foreground italic">[Image]</span>
                  </div>
                </div>

                <div
                  v-if="shouldShowCollectionBadge(item)"
                  class="flex shrink-0 items-center gap-1 rounded-md border border-primary/15 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary"
                  :title="getCollectionName(item.collection_id)"
                >
                  <component
                    :is="getCollectionIconComponent(getCollection(item.collection_id)?.icon)"
                    class="h-2.5 w-2.5"
                    :style="{ color: getCollection(item.collection_id)?.color || 'currentColor' }"
                  />
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
                  <HighlightText
                    :text="item.content"
                    :query="searchQuery"
                    :is-regex="searchRegex"
                    :is-case-sensitive="searchCaseSensitive"
                  />
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
            class="absolute right-2 top-2 flex gap-1 rounded-md border border-border bg-card p-0.5 shadow-sm transition-opacity"
            :class="isMenuOpen(item.id!) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
            @click.stop
          >
            <QuickActionMenu
              :item="item"
              :on-action-done="handleItemActionDone"
              @menu-open="(v) => handleMenuOpen(item.id!, v)"
            />
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
              @click.stop="itemToAddToCollection = item"
              size="icon"
              variant="ghost"
              class="h-6 w-6 text-muted-foreground hover:text-primary"
              :title="
                item.collection_id ? t('actions.moveToCollection') : t('actions.addToCollection')
              "
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
          <p class="text-sm">{{ emptyStateTitle }}</p>
          <p class="text-xs opacity-50 mt-1">{{ emptyStateSubtitle }}</p>
        </div>
      </div>
    </div>
    <!-- Footer Hint -->
    <div
      class="px-3 py-1.5 bg-card border-t border-border flex justify-between items-center text-[10px] text-muted-foreground font-medium"
    >
      <div class="flex items-center gap-2">
        <span class="flex items-center gap-1"
          ><span class="bg-muted px-1 rounded">↑↓</span> {{ t('actions.navigate') }}</span
        >
        <span class="flex items-center gap-1"
          ><span class="bg-muted px-1 rounded">↵</span> {{ t('actions.paste') }}</span
        >
        <span class="flex items-center gap-1"
          ><span class="bg-muted px-1 rounded">Space</span>
          {{ t('actions.preview').split(' ')[0] }}</span
        >
      </div>
      <!-- Version with update indicator -->
      <div class="flex items-center gap-1">
        <button
          v-if="props.isReadyToRestart"
          @click="emit('open-update-dialog')"
          class="flex items-center gap-1 px-1.5 rounded-full bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 transition-colors cursor-pointer animate-pulse"
        >
          <Power class="w-3 h-3" />
          <span>{{ t('updater.restartRequired') }}</span>
        </button>
        <button
          v-else-if="props.updateInfo"
          @click="emit('open-update-dialog')"
          class="flex items-center gap-1 px-1.5 rounded-full bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors cursor-pointer"
        >
          <span>v{{ props.updateInfo.current_version }}</span>
          <ArrowUpDown class="w-3 h-3" />
        </button>
        <span v-else class="opacity-60">v{{ props.currentVersion }}</span>
      </div>
      <div class="flex items-center gap-1">
        <span>{{ config.shortcut }}</span>
        <div v-if="isLoading" class="py-4 text-center text-xs text-muted-foreground">
          Loading...
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
          <QuickActionMenu :item="previewItem!" :on-action-done="handleItemActionDone" />
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
              pasteItem(previewItem!, false);
              previewItem = null;
            "
            class="gap-2"
          >
            <CornerDownLeft class="w-4 h-4" /> {{ t('actions.paste') }}
          </Button>
        </div>
      </div>
    </div>

    <!-- Collections Manager Dialog -->
    <Dialog v-model:open="showCollectionsManager">
      <DialogContent class="w-[460px]">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <Folder class="w-5 h-5 text-primary" /> {{ t('collections.managerTitle') }}
          </DialogTitle>
          <DialogDescription>
            {{ t('collections.allCollections') }} · {{ totalCollectedCount }}
            {{ t('stats.items') }}
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-2">
          <div class="flex gap-2">
            <Input
              v-model="newCollectionName"
              class="flex-1"
              input-class="h-9 rounded-lg border-border bg-background text-sm shadow-none"
              :placeholder="t('collections.newPlaceholder')"
              @keydown.enter="handleCreateCollection"
            />
            <Button @click="handleCreateCollection" class="shrink-0">
              <Plus class="h-4 w-4" />
            </Button>
          </div>
          <div class="max-h-[320px] space-y-1 overflow-y-auto custom-scrollbar">
            <div
              v-for="collection in collections"
              :key="collection.id"
              class="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2 text-left"
                @click="
                  openCollectionView(collection.id);
                  showCollectionsManager = false;
                "
              >
                <component
                  :is="getCollectionIconComponent(collection.icon)"
                  class="h-4 w-4 shrink-0"
                  :style="{ color: collection.color || 'currentColor' }"
                />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium text-foreground">
                    {{ collection.name }}
                  </div>
                  <div class="text-[11px] text-muted-foreground">
                    {{ collection.item_count || 0 }} {{ t('stats.items') }}
                  </div>
                </div>
              </button>
              <Button
                @click.stop="openCollectionEditor(collection)"
                variant="ghost"
                size="icon"
                class="h-8 w-8 shrink-0"
              >
                <Edit2 class="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              <Button
                @click.stop="handleDeleteCollection(collection)"
                variant="ghost"
                size="icon"
                class="h-8 w-8 shrink-0"
              >
                <X class="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Collection Editor Dialog -->
    <Dialog v-model:open="showCollectionEditor">
      <DialogContent class="w-[400px]">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <Folder class="w-5 h-5 text-primary" /> {{ t('collections.editCollection') }}
          </DialogTitle>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <!-- Name Input -->
          <div class="space-y-2">
            <Label class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {{ t('collections.rename') }}
            </Label>
            <Input v-model="editingCollectionName" input-class="h-8" />
          </div>

          <!-- Icon Selection -->
          <div class="space-y-2">
            <Label class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {{ t('collections.selectIcon') }}
            </Label>
            <div class="flex gap-2">
              <Button
                v-for="iconOpt in collectionIcons"
                :key="iconOpt.name"
                @click="editingCollectionIcon = iconOpt.name"
                variant="outline"
                size="icon"
                class="h-8 w-8"
                :class="{
                  'bg-primary text-primary-foreground': editingCollectionIcon === iconOpt.name,
                }"
              >
                <component :is="iconOpt.icon" class="w-4 h-4" />
              </Button>
            </div>
          </div>

          <!-- Color Selection -->
          <div class="space-y-2">
            <Label class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {{ t('collections.selectColor') }}
            </Label>
            <div class="flex gap-2">
              <Button
                v-for="colorOpt in collectionColors"
                :key="colorOpt"
                @click="editingCollectionColor = colorOpt"
                variant="outline"
                size="icon"
                class="h-8 w-8"
                :class="{ 'ring-2 ring-primary': editingCollectionColor === colorOpt }"
              >
                <div
                  v-if="colorOpt"
                  class="w-4 h-4 rounded-full"
                  :style="{ backgroundColor: colorOpt }"
                />
                <Palette v-else class="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button @click="showCollectionEditor = false" variant="outline">
            {{ t('settings.cancel') }}
          </Button>
          <Button @click="handleSaveCollection" :disabled="!editingCollectionName.trim()">
            {{ t('settings.save') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Clear History Confirmation Dialog -->
    <Dialog v-model:open="showClearConfirm">
      <DialogContent class="w-80">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-destructive">
            <Trash2 class="w-5 h-5" /> {{ t('actions.clearHistory') }}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription class="mb-6">
          {{ t('toast.confirmClearHistory') }}
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
            {{ t('actions.delete') }}
          </Button>
          <Button @click="showClearConfirm = false" variant="secondary" class="flex-1">
            {{ t('settings.cancel') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Settings Dialog -->
    <Dialog v-model:open="showSettings">
      <DialogContent class="w-[calc(100%-2rem)] max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <Settings class="w-5 h-5 text-primary" /> {{ t('settings.title') }}
          </DialogTitle>
        </DialogHeader>
        <form @submit="onSubmit">
          <div class="grid grid-cols-2 gap-x-4 gap-y-4 mt-4">
            <!-- Global Shortcut -->
            <FormField name="shortcut" class="col-span-2">
              <FormItem class="col-span-2">
                <FormLabel class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {{ t('settings.globalShortcut') }}
                </FormLabel>
                <FormControl>
                  <div class="relative">
                    <Input
                      readonly
                      :placeholder="t('settings.recordShortcut')"
                      class="cursor-pointer"
                      :model-value="tempShortcut"
                      @click="toggleShortcutRecording"
                    />
                    <span
                      v-if="isRecording"
                      class="absolute right-3 top-1/2 transform -translate-y-1/2 flex h-2 w-2"
                    >
                      <span
                        class="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"
                      ></span>
                      <span class="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
                    </span>
                  </div>
                </FormControl>
              </FormItem>
            </FormField>

            <!-- Screenshot Shortcut -->
            <FormField name="screenshot_shortcut" class="col-span-2">
              <FormItem class="col-span-2">
                <FormLabel class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {{ t('settings.screenshotShortcut') }}
                </FormLabel>
                <FormControl>
                  <div class="relative">
                    <Input
                      readonly
                      :placeholder="t('settings.recordShortcut')"
                      class="cursor-pointer"
                      :model-value="tempScreenshotShortcut"
                      @click="toggleScreenshotShortcutRecording"
                    />
                    <span
                      v-if="isRecordingScreenshotShortcut"
                      class="absolute right-3 top-1/2 transform -translate-y-1/2 flex h-2 w-2"
                    >
                      <span
                        class="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"
                      ></span>
                      <span class="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
                    </span>
                  </div>
                </FormControl>
              </FormItem>
            </FormField>

            <!-- Screenshot Format -->
            <FormField v-slot="{ componentField }" name="screenshot_format">
              <FormItem>
                <FormLabel class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {{ t('settings.screenshotFormat') }}
                </FormLabel>
                <FormControl>
                  <Select v-bind="componentField">
                    <SelectTrigger class="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="png">PNG</SelectItem>
                      <SelectItem value="jpeg">JPEG</SelectItem>
                      <SelectItem value="webp">WebP</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            </FormField>

            <!-- Screenshot Quality -->
            <FormField v-slot="{ componentField }" name="screenshot_quality">
              <FormItem>
                <FormLabel class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {{ t('settings.screenshotQuality') }}
                  <span class="ml-1 text-muted-foreground font-normal"
                    >({{ componentField.modelValue }}%)</span
                  >
                </FormLabel>
                <FormControl>
                  <Input
                    type="range"
                    min="1"
                    max="100"
                    :model-value="componentField.modelValue"
                    @update:model-value="componentField['onUpdate:modelValue']"
                    @input="
                      (e: Event) =>
                        componentField['onUpdate:modelValue']?.(
                          Number((e.target as HTMLInputElement).value)
                        )
                    "
                    @blur="componentField.onBlur"
                  />
                </FormControl>
              </FormItem>
            </FormField>

            <!-- Screenshot Save Action -->
            <FormField v-slot="{ componentField }" name="screenshot_save_action" class="col-span-2">
              <FormItem class="col-span-2">
                <FormLabel class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {{ t('settings.screenshotSaveAction') }}
                </FormLabel>
                <FormControl>
                  <Select v-bind="componentField">
                    <SelectTrigger class="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clipboard">{{
                        t('settings.saveActionClipboard')
                      }}</SelectItem>
                      <SelectItem value="file">{{ t('settings.saveActionFile') }}</SelectItem>
                      <SelectItem value="both">{{ t('settings.saveActionBoth') }}</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            </FormField>

            <!-- History Size -->
            <FormField v-slot="{ componentField }" name="max_history_size">
              <FormItem>
                <FormLabel class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {{ t('settings.historySize') }}
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
                <FormLabel class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {{ t('settings.language') }}
                </FormLabel>
                <FormControl>
                  <Select v-bind="componentField">
                    <SelectTrigger class="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        {{ t('settings.languageAuto') }}
                      </SelectItem>
                      <SelectItem value="en">{{ t('settings.languageEn') }}</SelectItem>
                      <SelectItem value="zh">{{ t('settings.languageZh') }} </SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            </FormField>

            <!-- Theme -->
            <FormField v-slot="{ componentField }" name="theme">
              <FormItem>
                <FormLabel class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {{ t('settings.theme') }}
                </FormLabel>
                <FormControl>
                  <Select v-bind="componentField">
                    <SelectTrigger class="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{{ t('settings.themeAuto') }}</SelectItem>
                      <SelectItem value="light">
                        {{ t('settings.themeLight') }}
                      </SelectItem>
                      <SelectItem value="dark">{{ t('settings.themeDark') }}</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            </FormField>
            <!-- Compact Mode -->
            <FormField v-slot="componentField" name="compact_mode">
              <FormItem class="flex flex-col">
                <FormLabel class="text-sm font-medium">
                  {{ t('settings.compactMode') }}
                </FormLabel>
                <FormControl>
                  <Switch
                    :model-value="componentField.value"
                    @update:model-value="componentField.handleChange"
                  />
                </FormControl>
              </FormItem>
            </FormField>

            <!-- Clear Pinned on Clear -->
            <FormField v-slot="componentField" name="clear_pinned_on_clear">
              <FormItem class="flex flex-col">
                <FormLabel class="text-sm font-medium"> 清除时包含置顶项 </FormLabel>
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
                <FormLabel class="text-sm font-medium"> 清除时包含收藏项 </FormLabel>
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
                  {{ t('settings.startAtLogin') }}
                </label>
                <Switch :checked="isAutoStart" @update:checked="toggleAutoStart" />
              </div>
            </div>

            <!-- Automation Rules -->
            <div class="col-span-2">
              <button
                type="button"
                class="flex items-center gap-2 w-full text-left mb-2"
                @click="showRules = !showRules"
              >
                <component
                  :is="showRules ? ChevronDown : ChevronRight"
                  class="w-4 h-4 text-muted-foreground"
                />
                <Zap class="w-4 h-4 text-primary" />
                <span class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {{ t('rules.title') }}
                </span>
                <span class="text-xs text-muted-foreground ml-auto">{{ rules.length }}</span>
              </button>

              <div v-if="showRules" class="space-y-2">
                <!-- Rule List -->
                <div
                  v-if="rules.length === 0"
                  class="text-sm text-muted-foreground py-3 text-center"
                >
                  {{ t('rules.noRules') }}
                </div>
                <div v-else class="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                  <div
                    v-for="rule in rules"
                    :key="rule.id"
                    class="flex items-center justify-between bg-muted/50 px-3 py-2 rounded text-sm group cursor-pointer hover:bg-muted/80 transition-colors"
                    @click="openRuleEditor(rule)"
                  >
                    <div class="flex items-center gap-2 min-w-0">
                      <Switch
                        :checked="rule.enabled"
                        class="scale-75"
                        @click.stop
                        @update:checked="toggleRuleEnabled(rule)"
                      />
                      <span
                        class="truncate"
                        :class="{ 'text-muted-foreground line-through': !rule.enabled }"
                      >
                        {{ rule.name }}
                      </span>
                    </div>
                    <div class="ml-2 flex shrink-0 items-center gap-2">
                      <span class="text-xs text-muted-foreground">
                        {{ getRuleActionLabel(rule) }}
                      </span>
                      <div
                        v-if="rule.action.action_type === 'add_to_collection'"
                        class="flex max-w-[132px] items-center gap-1 rounded-md border border-primary/15 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                      >
                        <component
                          :is="getCollectionIconComponent(getRuleTargetCollection(rule)?.icon)"
                          class="h-3 w-3 shrink-0"
                          :style="{ color: getRuleTargetCollection(rule)?.color || 'currentColor' }"
                        />
                        <span class="truncate">
                          {{
                            getRuleTargetCollection(rule)?.name || t('rules.collectionMissing')
                          }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Rule Editor -->
                <div v-if="showRuleEditor" class="border border-border rounded-lg p-3 bg-card">
                  <RuleEditor
                    :rule="editingRuleData || undefined"
                    :collections="collections"
                    @save="handleRuleSave"
                    @cancel="
                      showRuleEditor = false;
                      editingRuleData = null;
                    "
                    @delete="handleRuleDelete"
                  />
                </div>

                <!-- Add Rule Button -->
                <Button
                  v-if="!showRuleEditor"
                  type="button"
                  variant="outline"
                  size="sm"
                  class="w-full"
                  @click="openRuleEditor()"
                >
                  <Plus class="w-3 h-3 mr-1" /> {{ t('rules.addRule') }}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter class="flex gap-3 mt-8">
            <Button type="submit" class="flex-1">
              {{ t('settings.save') }}
            </Button>
            <Button type="button" @click="showSettings = false" variant="secondary" class="flex-1">
              {{ t('settings.cancel') }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <!-- Collection Selector Modal -->
    <div
      v-if="itemToAddToCollection"
      class="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4"
      @click.self="itemToAddToCollection = null"
    >
      <div
        class="bg-card rounded-xl shadow-2xl border border-border max-w-sm w-full flex flex-col overflow-hidden"
      >
        <div class="p-4 border-b border-border flex justify-between items-center">
          <h3 class="font-medium text-sm">
            {{ collectionDialogTitle }}
          </h3>
          <Button @click="itemToAddToCollection = null" size="icon" variant="ghost" class="h-6 w-6">
            <X class="w-4 h-4" />
          </Button>
        </div>
        <div class="border-b border-border px-4 py-3">
          <div class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {{ t('collections.currentCollection') }}
          </div>
          <div class="mt-2 flex items-center gap-2">
            <div
              class="flex items-center gap-1 rounded-md border border-border/80 bg-muted px-2 py-1 text-xs font-medium text-foreground"
            >
              <component
                :is="getCollectionIconComponent(currentItemCollection?.icon)"
                v-if="currentItemCollection"
                class="h-3 w-3"
                :style="{ color: currentItemCollection.color || 'currentColor' }"
              />
              <X v-else class="h-3 w-3 text-muted-foreground" />
              <span>{{ currentItemCollection?.name || t('collections.noCollection') }}</span>
            </div>
            <Button
              v-if="itemToAddToCollection.collection_id !== null"
              @click="handleAddToCollection(null)"
              variant="ghost"
              size="sm"
              class="h-7 rounded-lg px-2 text-xs text-muted-foreground hover:text-destructive"
            >
              {{ t('collections.removeFromCollection') }}
            </Button>
          </div>
        </div>
        <div class="p-2 overflow-y-auto max-h-[300px] space-y-1">
          <Button
            v-for="collection in collections"
            :key="collection.id"
            @click="handleAddToCollection(collection.id)"
            variant="ghost"
            size="sm"
            class="w-full justify-start rounded-lg border border-transparent px-2.5 text-xs text-muted-foreground hover:border-transparent hover:bg-accent hover:text-accent-foreground"
            :class="{
              'border-transparent bg-accent text-accent-foreground':
                itemToAddToCollection.collection_id === collection.id,
            }"
          >
            <component
              :is="getCollectionIconComponent(collection.icon)"
              class="mr-2 h-3 w-3"
              :style="{ color: collection.color || 'currentColor' }"
            />
            <span class="flex-1 truncate text-left">{{ collection.name }}</span>
            <span class="ml-2 shrink-0 text-[10px] text-muted-foreground">
              {{ collection.item_count || 0 }}
            </span>
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
