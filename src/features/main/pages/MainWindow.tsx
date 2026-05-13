/**
 * MainWindow - React Component
 *
 * Main clipboard management window with full feature parity with Vue MainWindow.vue.
 */
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { MemoryRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Command, Folder, Plus, Pause, Play, Trash2, BookOpen, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Titlebar } from '../components/Titlebar';
import { KnowledgePage, type KnowledgePageHandle } from '@/features/knowledge/pages/KnowledgePage';
import { ClipboardPage } from './ClipboardPage';
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
import { Input } from '@/components/ui/input';
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

function MainWindowInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const isKnowledge = location.pathname === '/knowledge';

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
  const [pendingKnowledgeContent, setPendingKnowledgeContent] = useState<string | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [showNewGroupDialog, setShowNewGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Ref to imperatively call KnowledgePage actions from Titlebar
  const knowledgePageRef = useRef<KnowledgePageHandle>(null);

  const handleSaveToKnowledge = useCallback(
    (item: ClipboardItem) => {
      setPendingKnowledgeContent(item.content ?? '');
      navigate('/knowledge');
    },
    [navigate]
  );

  const handleNewKnowledgeFromTitlebar = useCallback(() => {
    knowledgePageRef.current?.createNewKnowledge();
  }, []);

  const handleNewGroupFromTitlebar = useCallback(() => {
    setNewGroupName('');
    setShowNewGroupDialog(true);
  }, []);

  const handleNewGroupSubmit = useCallback(async () => {
    const name = newGroupName.trim();
    if (name) {
      await knowledgePageRef.current?.createNewGroup(name);
      setNewGroupName('');
      setShowNewGroupDialog(false);
    }
  }, [newGroupName]);

  // Refs for tracking and keyboard handler
  const lastFocusRefreshAtRef = useRef(0);
  const FOCUS_REFRESH_THROTTLE_MS = 600;
  const clipboardRef = useRef(clipboard);
  const settingsRef = useRef(settings);
  const isKnowledgeRef = useRef(isKnowledge);

  // Keep refs updated
  useEffect(() => {
    clipboardRef.current = clipboard;
  }, [clipboard]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    isKnowledgeRef.current = isKnowledge;
  }, [isKnowledge]);

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

  // Handle edit
  const handleOpenEditor = useCallback((item: ClipboardItem | null, noteOnly = false) => {
    setEditingItem(item);
    setEditNoteOnly(noteOnly);
    setShowItemEditor(true);
  }, []);

  // Compute context-aware Titlebar action buttons
  const titlebarActions = useMemo(() => {
    if (!isKnowledge) {
      return (
        <>
          <Button
            onClick={() => setShowCollectionsManager(true)}
            size="icon"
            variant="ghost"
            className="app-titlebar-action"
            title={t('actions.collections')}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Folder className="w-3.5 h-3.5" />
          </Button>
          <Button
            onClick={() => handleOpenEditor(null)}
            size="icon"
            variant="ghost"
            className="app-titlebar-action"
            title={t('actions.addItem')}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
          <Button
            onClick={settings.togglePause}
            size="icon"
            variant="ghost"
            className="app-titlebar-action"
            title={settings.isPaused ? t('actions.resumeRecording') : t('actions.pauseRecording')}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {settings.isPaused ? (
              <Play className="w-3.5 h-3.5 text-yellow-600" />
            ) : (
              <Pause className="w-3.5 h-3.5" />
            )}
          </Button>
          <Button
            onClick={() => setShowClearConfirm(true)}
            size="icon"
            variant="ghost"
            className="app-titlebar-action hover:text-destructive"
            title={t('actions.clearHistory')}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </>
      );
    } else {
      return (
        <>
          <Button
            onClick={handleNewKnowledgeFromTitlebar}
            variant="ghost"
            size="default"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            title={t('knowledge.newKnowledge')}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Plus className="size-3 shrink-0" />
            {t('knowledge.newKnowledge')}
          </Button>
          <Button
            onClick={handleNewGroupFromTitlebar}
            variant="ghost"
            size="default"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            title={t('knowledge.newGroup')}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <BookOpen className="size-3 shrink-0" />
            {t('knowledge.newGroup')}
          </Button>
          <Button
            onClick={() => setAiPanelOpen((v) => !v)}
            size="icon"
            variant="ghost"
            className={`app-titlebar-action ${aiPanelOpen ? 'text-primary bg-primary/10' : ''}`}
            title="AI Assistant (⌘I)"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Sparkles className="w-3.5 h-3.5" />
          </Button>
        </>
      );
    }
  }, [
    isKnowledge,
    aiPanelOpen,
    settings.isPaused,
    settings.togglePause,
    t,
    handleOpenEditor,
    handleNewKnowledgeFromTitlebar,
    handleNewGroupFromTitlebar,
  ]);

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
      // Skip clipboard navigation shortcuts on the knowledge route
      if (isKnowledgeRef.current && e.key !== 'Escape') return;

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

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // ⌘I — toggle AI panel when on knowledge route
      if ((e.metaKey || e.ctrlKey) && e.key === 'i' && isKnowledgeRef.current) {
        const target = e.target as HTMLElement | null;
        const isInput = !!target && ['INPUT', 'TEXTAREA'].includes(target.tagName);
        if (!isInput) {
          e.preventDefault();
          setAiPanelOpen((v) => !v);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  // Lifecycle - setup listeners (only run once on mount)
  useEffect(() => {
    let clipboardUnlisten: (() => void) | null = null;
    let configUnlisten: (() => void) | null = null;
    let settingsUnlisten: (() => void) | null = null;
    let focusUnlisten: (() => void) | null = null;
    let mounted = true;

    const setup = async () => {
      // Load initial data
      await settings.loadConfig();
      await clipboard.loadCollections();
      await clipboard.loadHistory(true);

      if (!mounted) return;

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
        settingsUnlisten?.();
      } catch (e) {
        console.warn('Failed to cleanup settings listener:', e);
      }
      try {
        focusUnlisten?.();
      } catch (e) {
        console.warn('Failed to cleanup focus listener:', e);
      }
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
      {/* Titlebar with integrated Segment Control */}
      <Titlebar actions={titlebarActions} onOpenSettings={settings.openSettings} />

      {/* Main content — routed pages */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <Routes>
          <Route
            path="/clipboard"
            element={
              <ClipboardPage
                clipboard={clipboard}
                settings={settings}
                updater={updater}
                menuOpenIds={menuOpenIds}
                onMenuOpen={handleMenuOpen}
                onItemActionDone={handleItemActionDone}
                onOpenItemEditor={handleOpenEditor}
                onAddToCollection={handleAddToCollection}
                onSaveToKnowledge={handleSaveToKnowledge}
              />
            }
          />
          <Route
            path="/knowledge"
            element={
              <KnowledgePage
                ref={knowledgePageRef}
                pendingContent={pendingKnowledgeContent}
                onPendingContentConsumed={() => setPendingKnowledgeContent(null)}
                aiPanelOpen={aiPanelOpen}
                onToggleAiPanel={() => setAiPanelOpen((v) => !v)}
              />
            }
          />
          <Route path="*" element={<Navigate to="/clipboard" replace />} />
        </Routes>
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

      {/* New Group Dialog */}
      <Dialog
        open={showNewGroupDialog}
        onOpenChange={(open) => {
          setShowNewGroupDialog(open);
          if (!open) setNewGroupName('');
        }}
      >
        <DialogContent className="w-80">
          <DialogHeader>
            <DialogTitle>{t('knowledge.newGroup')}</DialogTitle>
          </DialogHeader>
          <Input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder={t('knowledge.groupNamePlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNewGroupSubmit();
              if (e.key === 'Escape') setShowNewGroupDialog(false);
            }}
            autoFocus
          />
          <DialogFooter className="flex gap-3 mt-2">
            <Button onClick={() => setShowNewGroupDialog(false)} variant="ghost" className="flex-1">
              {t('actions.cancel')}
            </Button>
            <Button onClick={handleNewGroupSubmit} className="flex-1">
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

export function MainWindow() {
  return (
    <MemoryRouter initialEntries={['/clipboard']}>
      <MainWindowInner />
    </MemoryRouter>
  );
}

export default MainWindow;
