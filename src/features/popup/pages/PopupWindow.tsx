/**
 * PopupWindow - React Component
 *
 * Quick-access popup window for clipboard history.
 * Features: search, collection navigation, keyboard shortcuts, preview modal.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import {
  Search,
  FileText,
  Image as ImageIcon,
  Lock,
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { LocalImage } from '@/components/LocalImage';
import { QuickActionMenu } from '@/components/QuickActionMenu';
import { useClipboard } from '@/hooks/useClipboard';
import { useSettings } from '@/hooks/useSettings';
import { useToast } from '@/hooks/useToast';
import { useTimeAgo } from '@/hooks/useTimeAgo';
import type { ClipboardItem } from '@/types';

// File icon helper
function getFileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  if (!ext) return Files;

  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(ext)) return FileImage;
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) return FileAudio;
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv'].includes(ext)) return FileVideo;
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return FileArchive;
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return FileSpreadsheet;
  if (
    ['js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'py', 'rs', 'java', 'c', 'cpp'].includes(ext)
  )
    return FileCode;
  if (['doc', 'docx', 'pdf', 'txt', 'rtf', 'md'].includes(ext)) return FileText;
  return Files;
}

// Item icon helper
function getItemIcon(item: ClipboardItem) {
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

// Get files list from JSON content
function getFilesList(content: string): string[] {
  try {
    return JSON.parse(content);
  } catch {
    return [];
  }
}

// Get item primary text
function getItemPrimaryText(item: ClipboardItem): string {
  if (item.note?.trim()) return item.note.trim();

  if (item.kind === 'file') {
    const files = getFilesList(item.content);
    if (files.length === 0) return 'All History';
    return files.length === 1 ? files[0] : `${files.length} files`;
  }

  if (item.kind === 'image') {
    return item.is_sensitive ? 'Sensitive image' : 'Image item';
  }

  return item.content;
}

// Get item secondary text
function getItemSecondaryText(item: ClipboardItem): string | null {
  if (item.kind === 'text') {
    if (item.note?.trim()) return item.content;
    return item.data_type && item.data_type !== 'text' ? item.data_type.toUpperCase() : null;
  }

  if (item.kind === 'file') {
    const files = getFilesList(item.content);
    if (files.length === 0) return null;
    if (files.length === 1) return files[0];
    return `${files[0]} + ${files.length - 1} more`;
  }

  return null;
}

export function PopupWindow() {
  const { t } = useTranslation();
  const { toastMessage } = useToast();
  const { formatTimeAgo } = useTimeAgo();

  const {
    searchQuery,
    currentCollectionView,
    selectedIndex,
    previewItem,
    setPreviewItem,
    previewContent,
    filteredHistory,
    loadHistory,
    pasteItem,
    togglePin,
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
    setTimeRange,
    sortMode,
    setSortMode,
  } = useClipboard();

  const { config, loadConfig, setupConfigListeners } = useSettings();

  // State
  const [isSelectingCollection, setIsSelectingCollection] = useState(false);
  const [showHtml, setShowHtml] = useState(false);
  const [linkedScreenshot, setLinkedScreenshot] = useState<ClipboardItem | null>(null);
  const lastFocusRefreshAtRef = useRef(0);
  const POPUP_FOCUS_REFRESH_THROTTLE_MS = 600;

  // Refs for keyboard handler
  const clipboardStateRef = useRef({
    filteredHistory,
    selectedIndex,
    previewItem,
    selectedIds,
    pasteItem,
    pasteStack,
    toggleSelection,
    setPreviewItem,
    scrollToSelected,
  });

  // Keep ref updated
  useEffect(() => {
    clipboardStateRef.current = {
      filteredHistory,
      selectedIndex,
      previewItem,
      selectedIds,
      pasteItem,
      pasteStack,
      toggleSelection,
      setPreviewItem,
      scrollToSelected,
    };
  }, [
    filteredHistory,
    selectedIndex,
    previewItem,
    selectedIds,
    pasteItem,
    pasteStack,
    toggleSelection,
    setPreviewItem,
    scrollToSelected,
  ]);

  // Refs
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Computed values
  const currentCollectionLabel = useCallback(() => {
    if (currentCollectionView === 'all_collections') return t('collections.allCollections');
    if (currentCollectionView === 'collection_detail' && activeCollectionId) {
      return (
        collections.find((c) => c.id === activeCollectionId)?.name ||
        t('collections.allCollections')
      );
    }
    return t('searchPlaceholder');
  }, [currentCollectionView, activeCollectionId, collections, t]);

  const timeRangeOptions = [
    { value: 'all', label: t('timeRange.all') },
    { value: 'today', label: t('timeRange.today') },
    { value: 'week', label: t('timeRange.week') },
  ];

  const currentTimeRangeLabel =
    timeRangeOptions.find((opt) => opt.value === (timeRange ?? 'all'))?.label ?? t('timeRange.all');

  const getCollection = (id?: number | null) => {
    if (!id) return null;
    return collections.find((c) => c.id === id) || null;
  };

  const getCollectionName = (id?: number) => getCollection(id)?.name;

  const shouldShowCollectionBadge = (item: ClipboardItem) => {
    return currentCollectionView !== 'collection_detail' && !!getCollection(item.collection_id);
  };

  // Handle preview item change
  useEffect(() => {
    setShowHtml(!!previewItem?.html_content);

    if (previewItem?.screenshot_id) {
      invoke<ClipboardItem | null>('get_item_by_id', { id: previewItem.screenshot_id })
        .then((item) => setLinkedScreenshot(item ?? null))
        .catch(() => setLinkedScreenshot(null));
    } else {
      setLinkedScreenshot(null);
    }
  }, [previewItem]);

  // Handle keyboard navigation - use ref to avoid stale closures
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        !!target && (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable);
      const isComposing = e.isComposing || (e as any).keyCode === 229;

      if ((isInput || isComposing) && e.key !== 'Escape') return;

      const state = clipboardStateRef.current;
      const len = state.filteredHistory.length;
      if (len === 0 && e.key !== 'Escape') return;

      // Number keys 1-9 for quick paste
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (index < len) {
          e.preventDefault();
          state.pasteItem(state.filteredHistory[index]);
          getCurrentWindow().hide();
          return;
        }
      }

      // Vim navigation
      if ((e.ctrlKey && e.key === 'n') || e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'j')) {
        e.preventDefault();
        state.scrollToSelected();
      } else if (
        (e.ctrlKey && e.key === 'p') ||
        e.key === 'ArrowUp' ||
        (e.ctrlKey && e.key === 'k')
      ) {
        e.preventDefault();
        state.scrollToSelected();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (state.selectedIds.length > 0) {
          state.pasteStack();
        } else if (state.filteredHistory[state.selectedIndex]) {
          state.pasteItem(state.filteredHistory[state.selectedIndex]);
          getCurrentWindow().hide();
        }
      } else if (e.key === 'x') {
        e.preventDefault();
        if (state.filteredHistory[state.selectedIndex]) {
          state.toggleSelection(state.filteredHistory[state.selectedIndex]);
        }
      } else if (e.key === ' ') {
        e.preventDefault();
        if (state.previewItem) {
          state.setPreviewItem(null);
        } else if (state.filteredHistory[state.selectedIndex]) {
          state.setPreviewItem(state.filteredHistory[state.selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        if (state.previewItem) {
          state.setPreviewItem(null);
        } else {
          getCurrentWindow().hide();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle item click
  const handleItemClick = (item: ClipboardItem, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      toggleSelection(item);
    } else {
      pasteItem(item);
      getCurrentWindow().hide();
    }
  };

  // Handle action done
  const handleItemActionDone = async () => {
    await loadCollections();
    await loadHistory(true);
  };

  // Lifecycle - setup listeners (only run once on mount)
  useEffect(() => {
    let clipboardUnlisten: (() => void) | null = null;
    let configUnlisten: (() => void) | null = null;
    let focusUnlisten: (() => void) | null = null;
    let mounted = true;

    const setup = async () => {
      // Load initial data
      await loadConfig();
      await loadCollections();
      await loadHistory(true);

      if (!mounted) return;

      // Setup clipboard-update listener (returns cleanup function)
      clipboardUnlisten = await setupClipboardListeners();
      configUnlisten = await setupConfigListeners();

      // Focus refresh throttling - only refresh if data might have changed
      focusUnlisten = await listen('tauri://focus', () => {
        const now = Date.now();
        if (now - lastFocusRefreshAtRef.current < POPUP_FOCUS_REFRESH_THROTTLE_MS) return;
        lastFocusRefreshAtRef.current = now;
        loadCollections();
        loadHistory(true, { preserveExisting: true });
      });
    };

    setup();

    return () => {
      mounted = false;
      try {
        clipboardUnlisten?.();
      } catch (e) {
        console.warn('Failed to cleanup clipboard listener:', e);
      }
      try {
        configUnlisten?.();
      } catch (e) {
        console.warn('Failed to cleanup config listener:', e);
      }
      try {
        focusUnlisten?.();
      } catch (e) {
        console.warn('Failed to cleanup focus listener:', e);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-shell flex flex-col select-none">
      {/* Header */}
      <div className="app-header flex gap-2 items-center">
        {/* Search Bar */}
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <Input
            value={searchQuery}
            onChange={(e) => (searchQuery as any)(e.target.value)}
            className="w-full h-8 rounded-lg pl-9 pr-3 text-sm"
            placeholder={currentCollectionLabel()}
          />
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="shrink-0"
          onClick={() => setIsSelectingCollection(!isSelectingCollection)}
          title={t('actions.collections')}
        >
          <Folder className="w-4 h-4" />
        </Button>
      </div>

      {/* Quick Filters */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border/80 bg-card px-3 py-1.5 no-scrollbar">
        <Select
          value={timeRange ?? 'all'}
          onValueChange={(v) => setTimeRange(v === 'all' ? null : v)}
        >
          <SelectTrigger className="min-w-[104px] rounded-lg border-border bg-card px-2 text-[10px] shadow-none h-5">
            <div className="flex min-w-0 items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{currentTimeRangeLabel}</span>
            </div>
          </SelectTrigger>
          <SelectContent>
            {timeRangeOptions.map((range) => (
              <SelectItem key={range.value} value={range.value}>
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button
          onClick={() => setSortMode(sortMode === 'oldest' ? null : 'oldest')}
          variant="ghost"
          className="h-5 px-1.5 shrink-0 text-[8px]"
        >
          <ArrowUpDown className="mr-0.5 h-2 w-2" />
          {t('sort.oldest')}
        </Button>
      </div>

      {/* List */}
      <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar px-2 py-1.5 space-y-1">
        {isSelectingCollection ? (
          <>
            {/* Collection selection items */}
            <div
              className="group relative app-list-item cursor-pointer p-2 flex items-center gap-2 hover:border-transparent hover:bg-accent/70"
              onClick={() => {
                openHistoryView();
                setIsSelectingCollection(false);
              }}
            >
              <Hash className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('collections.allHistory')}</span>
            </div>
            <div
              className="group relative app-list-item cursor-pointer p-2 flex items-center gap-2 hover:border-transparent hover:bg-accent/70"
              onClick={() => {
                openAllCollectionsView();
                setIsSelectingCollection(false);
              }}
            >
              <Folder className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{t('collections.allCollections')}</span>
            </div>
            {collections.map((collection) => (
              <div
                key={collection.id}
                className="group relative app-list-item cursor-pointer p-2 flex items-center gap-2 hover:border-transparent hover:bg-accent/70"
                onClick={() => {
                  openCollectionView(collection.id);
                  setIsSelectingCollection(false);
                }}
              >
                <Folder className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{collection.name}</span>
              </div>
            ))}
          </>
        ) : (
          <>
            {/* History items */}
            {filteredHistory.map((item, index) => (
              <div
                key={item.timestamp}
                ref={(el) => {
                  if (el) itemRefs.current.set(index, el);
                }}
                className={`group relative app-list-item cursor-pointer hover:border-transparent hover:bg-accent/70 ${
                  index === selectedIndex ? 'app-list-item-active selected-item' : ''
                } ${item.id && selectedIds.includes(item.id) ? 'border-primary/40 bg-primary/10' : ''}
                ${config.compact_mode ? 'p-1.5' : 'p-2'}`}
                onClick={(e) => handleItemClick(item, e)}
                onMouseEnter={() => (selectedIndex as any)(index)}
              >
                {/* Selection Badge */}
                {item.id && selectedIds.includes(item.id) && (
                  <div className="absolute -top-1 -left-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center z-20 shadow-sm">
                    {selectedIds.indexOf(item.id) + 1}
                  </div>
                )}

                {/* Content */}
                <div className="flex items-start gap-2.5">
                  <div
                    className={`rounded-md bg-muted text-muted-foreground shrink-0 relative flex items-center justify-center ${
                      config.compact_mode ? 'w-5.5 h-5.5 p-1' : 'w-6 h-6 p-1'
                    }`}
                  >
                    {(() => {
                      const Icon = getItemIcon(item);
                      return <Icon className={config.compact_mode ? 'w-3 h-3' : 'w-3.5 h-3.5'} />;
                    })()}
                    {item.is_pinned && (
                      <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5 shadow-sm">
                        <Pin className="w-2 h-2" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-start justify-between gap-3">
                      <p
                        className={`flex-1 text-[13px] font-medium leading-5 text-foreground line-clamp-1 break-all ${
                          item.is_sensitive ? 'blur-sm group-hover:blur-none transition-all' : ''
                        } ${item.note && item.kind === 'text' ? 'text-muted-foreground' : ''}`}
                      >
                        {getItemPrimaryText(item)}
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5 pl-2">
                        {index < 9 && (
                          <span className="flex h-4 w-4 items-center justify-center rounded border border-border/60 bg-muted/50 text-[9px] font-mono text-muted-foreground">
                            {index + 1}
                          </span>
                        )}
                        {shouldShowCollectionBadge(item) && (
                          <div
                            className="flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary"
                            title={getCollectionName(item.collection_id)}
                          >
                            <Folder className="h-2.5 w-2.5" />
                            <span className="max-w-14 truncate">
                              {getCollectionName(item.collection_id)}
                            </span>
                          </div>
                        )}
                        {item.is_sensitive && (
                          <Lock className="h-3 w-3 shrink-0 text-yellow-600/70" />
                        )}
                        {item.is_pinned && <Pin className="h-3 w-3 shrink-0 text-primary/80" />}
                      </div>
                    </div>
                    {getItemSecondaryText(item) && (
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="line-clamp-1 min-w-0 flex-1 break-all">
                          {getItemSecondaryText(item)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Hover Actions */}
                <div className="absolute right-1.5 top-1.5 z-20 flex gap-1 rounded-md border border-border bg-card p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                  <QuickActionMenu item={item} onActionDone={handleItemActionDone} />
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(index);
                    }}
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                  >
                    {item.is_pinned ? (
                      <PinOff className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <Pin className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewItem(item);
                    }}
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:text-primary"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Empty State */}
            {filteredHistory.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                <Command className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-sm">{t('emptyState.title')}</p>
                <p className="text-xs opacity-50 mt-1">{t('emptyState.subtitle')}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end border-t border-border bg-card px-3 py-1">
        <div className="flex items-center gap-2.5 text-[9px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="bg-muted px-1.5 py-0.5 rounded border border-border font-mono text-[9px]">
              1-9
            </span>
            <span>{t('shortcuts.paste')}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="bg-muted px-1.5 py-0.5 rounded border border-border font-mono text-[9px]">
              Space
            </span>
            <span>{t('shortcuts.preview')}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="bg-muted px-1.5 py-0.5 rounded border border-border font-mono text-[9px]">
              x
            </span>
            <span>{t('shortcuts.select')}</span>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg">
          {toastMessage}
        </div>
      )}

      {/* Preview Modal */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 sm:p-8"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="bg-card rounded-xl shadow-2xl border border-border max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border bg-card px-4 py-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                {previewItem.kind === 'text' && <FileText className="w-4 h-4" />}
                {previewItem.kind === 'file' && <Files className="w-4 h-4" />}
                {previewItem.kind === 'image' && <ImageIcon className="w-4 h-4" />}
                <span className="text-sm font-medium">{formatTimeAgo(previewItem.timestamp)}</span>
              </div>
              <Button
                onClick={() => setPreviewItem(null)}
                size="icon"
                variant="ghost"
                className="h-8 w-8"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="overflow-auto bg-card px-6 py-6">
              {previewItem.kind === 'text' && (
                <div className="flex flex-col gap-2">
                  {previewItem.html_content && (
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs gap-1"
                        onClick={() => setShowHtml(!showHtml)}
                      >
                        {showHtml ? <FileText className="w-3 h-3" /> : <Code className="w-3 h-3" />}
                        {showHtml ? 'Text' : 'HTML'}
                      </Button>
                    </div>
                  )}
                  {showHtml && previewItem.html_content ? (
                    <div
                      className="rounded-md border border-input bg-background shadow-sm overflow-auto text-sm leading-relaxed p-4 min-w-full w-fit"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(previewItem.html_content, {
                          ADD_ATTR: ['style'],
                        }),
                      }}
                    />
                  ) : (
                    <pre className="font-mono text-sm text-foreground whitespace-pre-wrap break-all">
                      {previewContent || previewItem.content}
                    </pre>
                  )}
                  {linkedScreenshot && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />
                        {t('preview.sourceScreenshot')}
                      </p>
                      <LocalImage
                        src={linkedScreenshot.content}
                        className="max-w-full max-h-40 rounded-md shadow-sm cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setPreviewItem(linkedScreenshot)}
                      />
                    </div>
                  )}
                </div>
              )}
              {previewItem.kind === 'file' && (
                <div className="flex flex-col gap-2">
                  <h3 className="font-medium text-sm text-muted-foreground">
                    {getFilesList(previewItem.content).length} Files
                  </h3>
                  <div className="space-y-1">
                    {getFilesList(previewItem.content).map((file, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm break-all font-mono"
                      >
                        {(() => {
                          const Icon = getFileIcon(file);
                          return <Icon className="shrink-0 w-5 h-5 text-muted-foreground" />;
                        })()}
                        {file}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {previewItem.kind === 'image' && (
                <div className="flex justify-center">
                  <LocalImage
                    src={previewItem.content}
                    className="max-w-full rounded-lg shadow-lg"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-card px-3 py-3">
              {previewItem.kind === 'image' && (
                <Button onClick={() => ocrImage(previewItem)} variant="secondary" className="gap-2">
                  <ScanText className="w-4 h-4" /> {t('actions.ocr')}
                </Button>
              )}
              <Button
                onClick={() => {
                  pasteItem(previewItem);
                  setPreviewItem(null);
                  getCurrentWindow().hide();
                }}
                className="gap-2"
              >
                <CornerDownLeft className="w-4 h-4" /> {t('actions.paste')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PopupWindow;
