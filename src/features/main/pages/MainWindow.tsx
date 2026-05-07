/**
 * MainWindow - React Component
 *
 * Main clipboard management window with full feature parity with Vue MainWindow.vue.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Power, ArrowUpDown, Command } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Titlebar } from '../components/Titlebar';
import { SearchToolbar } from '../components/SearchToolbar';
import { FilterToolbar } from '../components/FilterToolbar';
import { ClipboardList } from '../components/ClipboardList';
import { PreviewModal } from '../components/PreviewModal';
import { SettingsDialog } from '../components/SettingsDialog';
import { CollectionsManagerDialog } from '../components/CollectionsManagerDialog';
import { CollectionSelectorModal } from '../components/CollectionSelectorModal';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ItemEditorDialog } from '@/components/ItemEditorDialog';
import { PermissionDialog } from '@/components/PermissionDialog';
import { UpdateDialog } from '@/components/UpdateDialog';

import { useClipboard } from '@/hooks/useClipboard';
import { useSettings } from '@/hooks/useSettings';
import { useToast } from '@/hooks/useToast';
import { useUpdater } from '@/hooks/useUpdater';
import { useRules } from '@/hooks/useRules';
import { confirm } from '@/hooks/useConfirm';

import type { ClipboardItem } from '@/types';

// Filter type
type FilterType =
  | 'all'
  | 'text'
  | 'image'
  | 'file'
  | 'sensitive'
  | 'snippet'
  | 'url'
  | 'email'
  | 'code'
  | 'phone';

export function MainWindow() {
  const { t } = useTranslation();
  const { toastMessage } = useToast();

  // Clipboard hook
  const clipboard = useClipboard();

  // Settings hook
  const settings = useSettings();

  // Updater hook
  const updater = useUpdater();

  // Rules hook
  const rules = useRules();

  // Local state
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [editingItem, setEditingItem] = useState<ClipboardItem | null>(null);
  const [editNoteOnly, setEditNoteOnly] = useState(false);
  const [showItemEditor, setShowItemEditor] = useState(false);
  const [itemToAddToCollection, setItemToAddToCollection] = useState<ClipboardItem | null>(null);
  const [showCollectionsManager, setShowCollectionsManager] = useState(false);
  const [menuOpenIds, setMenuOpenIds] = useState<Set<number>>(new Set());
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);

  // Refs for tracking and keyboard handler
  const lastFocusRefreshAtRef = useRef(0);
  const FOCUS_REFRESH_THROTTLE_MS = 600;
  const clipboardRef = useRef(clipboard);
  const settingsRef = useRef(settings);

  // Keep refs updated
  useEffect(() => {
    clipboardRef.current = clipboard;
  }, [clipboard]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Collection filter value
  const getCollectionFilterValue = useCallback(() => {
    if (clipboard.currentCollectionView === 'history') return 'history';
    if (clipboard.currentCollectionView === 'all_collections') return 'all_collections';
    if (clipboard.currentCollectionView === 'collection_detail' && clipboard.activeCollectionId) {
      return `collection:${clipboard.activeCollectionId}`;
    }
    return 'history';
  }, [clipboard.currentCollectionView, clipboard.activeCollectionId]);

  const handleCollectionFilterChange = useCallback(
    (value: string) => {
      if (value === 'history') clipboard.openHistoryView();
      else if (value === 'all_collections') clipboard.openAllCollectionsView();
      else if (value.startsWith('collection:')) {
        const id = parseInt(value.split(':')[1]);
        clipboard.openCollectionView(id);
      }
    },
    [clipboard]
  );

  // Handle menu open
  const handleMenuOpen = useCallback((id: number, isOpen: boolean) => {
    setMenuOpenIds((prev) => {
      const next = new Set(prev);
      if (isOpen) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Handle item action done
  const handleItemActionDone = useCallback(async () => {
    await clipboard.loadCollections();
    await clipboard.loadHistory(true);
    await rules.loadRules();
  }, [clipboard, rules]);

  // Handle item click
  const handleItemClick = useCallback(
    (item: ClipboardItem, e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey) {
        clipboard.toggleSelection(item);
      } else {
        clipboard.pasteItem(item, false);
      }
    },
    [clipboard]
  );

  // Handle edit
  const handleOpenEditor = useCallback((item: ClipboardItem | null, noteOnly = false) => {
    setEditingItem(item);
    setEditNoteOnly(noteOnly);
    setShowItemEditor(true);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setShowItemEditor(false);
    setEditingItem(null);
    setEditNoteOnly(false);
    // Note: Don't call loadHistory on cancel - no data changed
    // clipboard-update event will handle refresh if needed
  }, []);

  // Handle collection assignment
  const handleAddToCollection = useCallback((item: ClipboardItem) => {
    setItemToAddToCollection(item);
  }, []);

  // Handle clear history
  const handleClearHistory = useCallback(async () => {
    const confirmed = await confirm({ title: t('toast.confirmClearHistory') });
    if (confirmed) {
      await clipboard.clearHistory();
      await clipboard.loadHistory(true);
    }
    setShowClearConfirm(false);
  }, [clipboard, t]);

  // TODO: 截屏功能暂时隐藏
  // Handle screenshot
  // const handleScreenshot = useCallback(async () => {
  //   try {
  //     await invoke('start_capture');
  //   } catch (error) {
  //     console.error('Screenshot failed:', error);
  //   }
  // }, []);

  // Handle keyboard navigation - use refs to avoid stale closures
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = !!target && ['INPUT', 'TEXTAREA'].includes(target.tagName);
      const isComposing = e.isComposing;

      if ((isInput || isComposing) && e.key !== 'Escape') return;

      const clip = clipboardRef.current;
      const sett = settingsRef.current;
      const len = clip.filteredHistory.length;
      if (len === 0 && e.key !== 'Escape') return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        clip.setSelectedIndex(Math.min(clip.selectedIndex + 1, len - 1));
        clip.scrollToSelected();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        clip.setSelectedIndex(Math.max(clip.selectedIndex - 1, 0));
        clip.scrollToSelected();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (clip.selectedIds.length > 0) {
          clip.pasteStack();
        } else if (clip.filteredHistory[clip.selectedIndex]) {
          clip.pasteItem(clip.filteredHistory[clip.selectedIndex], false);
        }
      } else if (e.key === ' ') {
        e.preventDefault();
        if (clip.previewItem) clip.setPreviewItem(null);
        else if (clip.filteredHistory[clip.selectedIndex])
          clip.setPreviewItem(clip.filteredHistory[clip.selectedIndex]);
      } else if (e.key === 'Escape') {
        if (clip.previewItem) clip.setPreviewItem(null);
        else if (sett.showSettings) sett.setShowSettings(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle scroll for pagination
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
      if (nearBottom && !clipboard.isLoading) clipboard.loadMore();
    },
    [clipboard]
  );

  // Lifecycle - setup listeners (only run once on mount)
  useEffect(() => {
    let clipboardUnlisten: (() => void) | null = null;
    let configUnlisten: (() => void) | null = null;
    let settingsUnlisten: (() => void) | null = null;
    let focusUnlisten: (() => void) | null = null;

    const setup = async () => {
      // Load initial data
      await settings.loadConfig();
      await clipboard.loadCollections();
      await clipboard.loadHistory(true);

      // Setup clipboard-update listener (returns cleanup function)
      clipboardUnlisten = await clipboard.setupClipboardListeners();
      configUnlisten = await settings.setupConfigListeners();

      // Listen for open-settings event
      settingsUnlisten = await listen('open-settings', () => settings.openSettings());

      // Focus refresh throttling - only refresh if data might have changed
      focusUnlisten = await listen('tauri://focus', () => {
        const now = Date.now();
        if (now - lastFocusRefreshAtRef.current < FOCUS_REFRESH_THROTTLE_MS) return;
        lastFocusRefreshAtRef.current = now;
        // Only refresh collections count, preserve existing history
        clipboard.loadCollections();
        clipboard.loadHistory(true, { preserveExisting: true });
      });
    };

    setup();

    return () => {
      clipboardUnlisten?.();
      configUnlisten?.();
      settingsUnlisten?.();
      focusUnlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check permission on mount (macOS)
  useEffect(() => {
    const checkPermission = async () => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      if (isMac) {
        const hasPermission = localStorage.getItem('screen-recording-permission-acknowledged');
        if (!hasPermission) {
          try {
            const permitted = await invoke<boolean>('check_screen_recording_permission');
            if (!permitted) {
              setShowPermissionDialog(true);
            }
          } catch (error) {
            console.error('Permission check failed:', error);
          }
        }
      }
    };
    checkPermission();
  }, []);

  // Total collected count
  const totalCollectedCount = clipboard.collections.reduce(
    (sum, c) => sum + (c.item_count || 0),
    0
  );

  // Save config helper for SettingsDialog
  const handleSaveConfig = useCallback(async () => {
    try {
      await invoke('save_config', {
        shortcut: settings.tempShortcut,
        screenshotShortcut: settings.tempScreenshotShortcut,
        maxHistorySize: settings.tempMaxSize,
        language: settings.tempLanguage,
        theme: settings.tempTheme,
        compactMode: settings.tempCompactMode,
        clearPinnedOnClear: settings.tempClearPinnedOnClear,
        clearCollectedOnClear: settings.tempClearCollectedOnClear,
        screenshotFormat: settings.tempScreenshotFormat,
        screenshotQuality: settings.tempScreenshotQuality,
        screenshotSaveAction: settings.tempScreenshotSaveAction,
      });
      await settings.loadConfig();
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }, [settings]);

  return (
    <div className="app-shell flex flex-col select-none">
      {/* Titlebar */}
      <Titlebar
        onOpenCollections={() => setShowCollectionsManager(true)}
        onOpenEditor={() => handleOpenEditor(null)}
        onOpenSettings={settings.openSettings}
        onClearHistory={() => setShowClearConfirm(true)}
        isPaused={settings.isPaused}
        onTogglePause={settings.togglePause}
      />

      {/* Header: Search */}
      <div className="app-header space-y-3">
        <SearchToolbar
          searchQuery={clipboard.searchQuery}
          onSearchChange={clipboard.setSearchQuery}
          searchCaseSensitive={clipboard.searchCaseSensitive}
          onCaseSensitiveChange={clipboard.setSearchCaseSensitive}
          searchRegex={clipboard.searchRegex}
          onRegexChange={clipboard.setSearchRegex}
        />

        <FilterToolbar
          activeFilter={clipboard.activeFilter as FilterType}
          onFilterChange={(v) => clipboard.setActiveFilter(v)}
          collections={clipboard.collections}
          collectionFilterValue={getCollectionFilterValue()}
          onCollectionFilterChange={handleCollectionFilterChange}
          timeRange={clipboard.timeRange}
          onTimeRangeChange={clipboard.setTimeRange}
          sortMode={clipboard.sortMode}
          onSortModeChange={clipboard.setSortMode}
          totalCount={clipboard.totalCount}
        />
      </div>

      {/* Clipboard List */}
      <div className="flex-1 flex overflow-hidden">
        <ClipboardList
          items={clipboard.filteredHistory}
          selectedIndex={clipboard.selectedIndex}
          compactMode={settings.config.compact_mode}
          searchQuery={clipboard.searchQuery}
          searchRegex={clipboard.searchRegex}
          searchCaseSensitive={clipboard.searchCaseSensitive}
          collections={clipboard.collections}
          currentCollectionView={clipboard.currentCollectionView}
          onItemClick={handleItemClick}
          onItemMouseEnter={clipboard.setSelectedIndex}
          onTogglePin={clipboard.togglePin}
          onToggleSnippet={clipboard.toggleSnippet}
          onToggleSensitive={clipboard.toggleSensitive}
          onPreview={clipboard.setPreviewItem}
          onDelete={clipboard.deleteItem}
          onEdit={(item) => handleOpenEditor(item)}
          onEditNote={(item) => handleOpenEditor(item, true)}
          onAddToCollection={handleAddToCollection}
          onMenuOpen={handleMenuOpen}
          menuOpenIds={menuOpenIds}
          onActionDone={handleItemActionDone}
          onScroll={handleScroll}
          isLoading={clipboard.isLoading}
        />
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 bg-card border-t border-border flex justify-between items-center text-[10px] text-muted-foreground font-medium">
        <div className="flex items-center gap-2">
          <span>
            <span className="bg-muted px-1 rounded">↑↓</span> {t('actions.navigate')}
          </span>
          <span>
            <span className="bg-muted px-1 rounded">↵</span> {t('actions.paste')}
          </span>
          <span>
            <span className="bg-muted px-1 rounded">Space</span> {t('actions.preview')}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {updater.isReadyToRestart && (
            <button
              onClick={() => updater.openUpdateDialog()}
              className="flex items-center gap-1 px-1.5 rounded-full bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 transition-colors cursor-pointer animate-pulse"
            >
              <Power className="w-3 h-3" />
              <span>{t('updater.restartRequired')}</span>
            </button>
          )}
          {updater.updateInfo && !updater.isReadyToRestart && (
            <button
              onClick={() => updater.openUpdateDialog()}
              className="flex items-center gap-1 px-1.5 rounded-full bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors cursor-pointer"
            >
              <span>v{updater.updateInfo.current_version}</span>
              <ArrowUpDown className="w-3 h-3" />
            </button>
          )}
          {!updater.updateInfo && <span className="opacity-60">v{updater.currentVersion}</span>}
        </div>

        <div className="flex items-center gap-1">
          <span>{settings.config.shortcut}</span>
          {clipboard.isLoading && <span className="text-xs">Loading...</span>}
        </div>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg">
          {toastMessage}
        </div>
      )}

      {/* Preview Modal */}
      <PreviewModal
        previewItem={clipboard.previewItem}
        previewContent={clipboard.previewContent}
        onClose={() => clipboard.setPreviewItem(null)}
        onPaste={(item) => clipboard.pasteItem(item, false)}
        onOcr={clipboard.ocrImage}
        onActionDone={handleItemActionDone}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        open={settings.showSettings}
        onOpenChange={settings.setShowSettings}
        config={settings.config}
        tempShortcut={settings.tempShortcut}
        tempScreenshotShortcut={settings.tempScreenshotShortcut}
        tempMaxSize={settings.tempMaxSize}
        tempLanguage={settings.tempLanguage}
        tempTheme={settings.tempTheme}
        tempCompactMode={settings.tempCompactMode}
        tempClearPinnedOnClear={settings.tempClearPinnedOnClear}
        tempClearCollectedOnClear={settings.tempClearCollectedOnClear}
        tempScreenshotFormat={settings.tempScreenshotFormat}
        tempScreenshotQuality={settings.tempScreenshotQuality}
        tempScreenshotSaveAction={settings.tempScreenshotSaveAction}
        isRecording={settings.isRecording}
        isRecordingScreenshotShortcut={settings.isRecordingScreenshotShortcut}
        isAutoStart={settings.isAutoStart}
        onSetTempShortcut={settings.setTempShortcut}
        onSetTempScreenshotShortcut={settings.setTempScreenshotShortcut}
        onSetTempMaxSize={settings.setTempMaxSize}
        onSetTempLanguage={settings.setTempLanguage}
        onSetTempTheme={settings.setTempTheme}
        onSetTempCompactMode={settings.setTempCompactMode}
        onSetTempClearPinnedOnClear={settings.setTempClearPinnedOnClear}
        onSetTempClearCollectedOnClear={settings.setTempClearCollectedOnClear}
        onSetTempScreenshotFormat={settings.setTempScreenshotFormat}
        onSetTempScreenshotQuality={settings.setTempScreenshotQuality}
        onSetTempScreenshotSaveAction={settings.setTempScreenshotSaveAction}
        onStartRecordingShortcut={settings.startRecordingShortcut}
        onStartRecordingScreenshotShortcut={settings.startRecordingScreenshotShortcut}
        onStopRecordingShortcut={settings.stopRecordingShortcut}
        onStopRecordingScreenshotShortcut={settings.stopRecordingScreenshotShortcut}
        onToggleAutoStart={settings.toggleAutoStart}
        onSaveConfig={handleSaveConfig}
        onLoadConfig={settings.loadConfig}
      />

      {/* Collections Manager Dialog */}
      <CollectionsManagerDialog
        open={showCollectionsManager}
        onOpenChange={setShowCollectionsManager}
        collections={clipboard.collections}
        totalCollectedCount={totalCollectedCount}
        onOpenCollectionView={(id) => {
          clipboard.openCollectionView(id);
          setShowCollectionsManager(false);
        }}
        onRefresh={handleItemActionDone}
        onCreateCollection={clipboard.createCollection}
        onDeleteCollection={clipboard.deleteCollection}
        onUpdateCollection={clipboard.updateCollection}
      />

      {/* Item Editor Dialog */}
      <ItemEditorDialog
        open={showItemEditor}
        item={editingItem}
        noteOnly={editNoteOnly}
        onSave={async (data) => {
          if (editingItem?.id) {
            await clipboard.updateItemContent(
              editingItem.id,
              data.content,
              data.dataType,
              data.note,
              data.html_content
            );
          } else {
            await clipboard.addItem(data.content);
          }
          await handleCloseEditor();
        }}
        onClose={handleCloseEditor}
      />

      {/* Collection Selector Modal */}
      <CollectionSelectorModal
        open={itemToAddToCollection !== null}
        onOpenChange={(open) => {
          if (!open) setItemToAddToCollection(null);
        }}
        item={itemToAddToCollection}
        collections={clipboard.collections}
        onSelect={async (collectionId) => {
          if (itemToAddToCollection?.id) {
            await clipboard.setItemCollection(itemToAddToCollection.id, collectionId);
            setItemToAddToCollection(null);
            await handleItemActionDone();
          }
        }}
        onRemove={async () => {
          if (itemToAddToCollection?.id) {
            await clipboard.setItemCollection(itemToAddToCollection.id, null);
            setItemToAddToCollection(null);
            await handleItemActionDone();
          }
        }}
      />

      {/* Clear Confirm Dialog */}
      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent className="w-80">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Command className="w-5 h-5" /> {t('actions.clearHistory')}
            </DialogTitle>
          </DialogHeader>
          <DialogDescription>{t('toast.confirmClearHistory')}</DialogDescription>
          <DialogFooter className="flex gap-3">
            <Button onClick={handleClearHistory} variant="destructive" className="flex-1">
              {t('actions.delete')}
            </Button>
            <Button onClick={() => setShowClearConfirm(false)} variant="outline" className="flex-1">
              {t('settings.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permission Dialog */}
      {showPermissionDialog && <PermissionDialog />}

      {/* Update Dialog */}
      <UpdateDialog
        open={updater.showUpdateDialog}
        updateInfo={updater.updateInfo}
        isReadyToRestart={updater.isReadyToRestart}
        downloadProgress={updater.downloadProgress}
        downloadedBytes={updater.downloadedBytes}
        totalBytes={updater.totalBytes}
        isDownloading={updater.isDownloading}
        isInstalling={updater.isInstalling}
        updateError={updater.updateError}
        onClose={() => updater.closeDialog()}
        onDownload={updater.downloadAndInstall}
        onRestart={updater.restartApp}
      />
    </div>
  );
}

export default MainWindow;
