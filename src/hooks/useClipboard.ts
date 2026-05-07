import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import { confirm } from '@/hooks/useConfirm';
import { useToast } from '@/hooks/useToast';
import type { ClipboardItem, Collection, CollectionView } from '@/types';

type ActiveFilter =
  | 'all'
  | 'text'
  | 'image'
  | 'sensitive'
  | 'url'
  | 'email'
  | 'code'
  | 'phone'
  | 'file'
  | 'snippet';

const PAGE_SIZE = 50;

export function useClipboard() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [history, setHistory] = useState<ClipboardItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchRegex, setSearchRegex] = useState(false);
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [currentCollectionView, setCurrentCollectionView] = useState<CollectionView>('history');
  const [activeCollectionId, setActiveCollectionId] = useState<number | null>(null);
  const [sourceApp, setSourceApp] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<ClipboardItem | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const currentPageRef = useRef(1);
  const isLoadingRef = useRef(false);
  const didMountFiltersRef = useRef(false);

  const filteredHistory = useMemo(() => history, [history]);

  const collectionScope = useMemo<string | null>(() => {
    if (currentCollectionView === 'all_collections') return 'all_collections';
    if (currentCollectionView === 'collection_detail') return 'collection_detail';
    return null;
  }, [currentCollectionView]);

  const setCollectionView = useCallback(
    (view: CollectionView, collectionId: number | null = null) => {
      setCurrentCollectionView(view);
      setActiveCollectionId(view === 'collection_detail' ? collectionId : null);
    },
    []
  );

  const openHistoryView = useCallback(() => setCollectionView('history'), [setCollectionView]);

  const openAllCollectionsView = useCallback(
    () => setCollectionView('all_collections'),
    [setCollectionView]
  );

  const openCollectionView = useCallback(
    (collectionId: number) => setCollectionView('collection_detail', collectionId),
    [setCollectionView]
  );

  const loadCollections = useCallback(async () => {
    try {
      const nextCollections = await invoke<Collection[]>('get_collections');
      setCollections(nextCollections);
      // Check if current collection still exists - use functional update to avoid dependency
      setActiveCollectionId((currentId) => {
        if (
          currentId !== null &&
          !nextCollections.some((collection) => collection.id === currentId)
        ) {
          setCurrentCollectionView('all_collections');
          return null;
        }
        return currentId;
      });
    } catch (error) {
      console.error('Failed to load collections:', error);
    }
  }, []);

  const loadHistory = useCallback(
    async (reset = false, options?: { preserveExisting?: boolean; page?: number }) => {
      console.log('[loadHistory] Called with reset:', reset, 'options:', options);
      if (isLoadingRef.current) {
        console.log('[loadHistory] Already loading, skipping');
        return;
      }
      isLoadingRef.current = true;
      setIsLoading(true);

      try {
        const preserveExisting = options?.preserveExisting ?? false;
        const nextPage = options?.page ?? (reset ? 1 : currentPageRef.current);

        if (reset) {
          currentPageRef.current = 1;
          setCurrentPage(1);
          if (!preserveExisting) {
            setHistory([]);
          }
          setHasMore(true);
        }

        const newItems = await invoke<ClipboardItem[]>('get_history', {
          page: nextPage,
          pageSize: PAGE_SIZE,
          query: searchQuery || null,
          searchRegex,
          searchCaseSensitive,
          collectionScope,
          collectionId: activeCollectionId,
          activeFilter: activeFilter === 'all' ? null : activeFilter,
          sourceApp,
          timeRange,
          sortMode,
        });

        setHasMore(newItems.length >= PAGE_SIZE);
        setHistory((current) => (reset ? newItems : [...current, ...newItems]));

        const nextTotalCount = await invoke<number>('get_history_count', {
          query: searchQuery || null,
          searchRegex,
          searchCaseSensitive,
          collectionScope,
          collectionId: activeCollectionId,
          activeFilter: activeFilter === 'all' ? null : activeFilter,
          sourceApp,
          timeRange,
        });

        setTotalCount(nextTotalCount);
        setSelectedIndex((index) => (index >= newItems.length && reset ? 0 : index));
      } catch (error) {
        console.error('Failed to load history:', error);
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    },
    [
      activeCollectionId,
      activeFilter,
      collectionScope,
      searchCaseSensitive,
      searchQuery,
      searchRegex,
      sortMode,
      sourceApp,
      timeRange,
    ]
  );

  useEffect(() => {
    if (!didMountFiltersRef.current) {
      didMountFiltersRef.current = true;
      return;
    }

    // Reset and reload when filters change
    currentPageRef.current = 1;
    setCurrentPage(1);
    setHistory([]);
    setHasMore(true);
    isLoadingRef.current = true;
    setIsLoading(true);

    invoke<ClipboardItem[]>('get_history', {
      page: 1,
      pageSize: PAGE_SIZE,
      query: searchQuery || null,
      searchRegex,
      searchCaseSensitive,
      collectionScope,
      collectionId: activeCollectionId,
      activeFilter: activeFilter === 'all' ? null : activeFilter,
      sourceApp,
      timeRange,
      sortMode,
    })
      .then((newItems) => {
        setHasMore(newItems.length >= PAGE_SIZE);
        setHistory(newItems);
        return invoke<number>('get_history_count', {
          query: searchQuery || null,
          searchRegex,
          searchCaseSensitive,
          collectionScope,
          collectionId: activeCollectionId,
          activeFilter: activeFilter === 'all' ? null : activeFilter,
          sourceApp,
          timeRange,
        });
      })
      .then((count) => {
        setTotalCount(count);
        setSelectedIndex(0);
      })
      .catch((error) => {
        console.error('Failed to load history:', error);
      })
      .finally(() => {
        isLoadingRef.current = false;
        setIsLoading(false);
      });
  }, [
    activeCollectionId,
    activeFilter,
    collectionScope,
    currentCollectionView,
    searchCaseSensitive,
    searchQuery,
    searchRegex,
    sortMode,
    sourceApp,
    timeRange,
  ]);

  useEffect(() => {
    let disposed = false;

    async function loadPreviewContent(item: ClipboardItem) {
      if (item.kind === 'text' && item.id) {
        setPreviewContent(item.content);
        try {
          const fullContent = await invoke<string>('get_item_content', { id: item.id });
          if (!disposed) {
            setPreviewItem((current) => {
              if (current?.id === item.id) {
                setPreviewContent(fullContent);
              }
              return current;
            });
          }
        } catch (error) {
          console.error('Failed to fetch full content for preview:', error);
        }
      } else {
        setPreviewContent('');
      }
    }

    if (!previewItem) {
      setPreviewContent('');
      return;
    }

    void loadPreviewContent(previewItem);

    return () => {
      disposed = true;
    };
  }, [previewItem]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingRef.current) return;
    const nextPage = currentPageRef.current + 1;
    currentPageRef.current = nextPage;
    setCurrentPage(nextPage);
    await loadHistory(false, { page: nextPage });
  }, [hasMore, loadHistory]);

  const toggleSelection = useCallback((item: ClipboardItem) => {
    if (!item.id) return;
    setSelectedIds((ids) =>
      ids.includes(item.id!) ? ids.filter((id) => id !== item.id) : [...ids, item.id!]
    );
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const pasteItem = useCallback(
    async (item: ClipboardItem, hideWindow = true) => {
      try {
        setPreviewItem(null);

        if (hideWindow) {
          await getCurrentWindow().hide();
        }

        let content = item.content;
        if (item.kind === 'text' && item.id) {
          try {
            content = await invoke<string>('get_item_content', { id: item.id });
          } catch (error) {
            console.error('Failed to fetch full content, using preview:', error);
          }
        }

        await invoke('set_clipboard_item', {
          content,
          kind: item.kind,
          id: item.id,
          htmlContent: item.html_content,
        });
        // Note: clipboard-update event will trigger loadHistory automatically
        // so we don't need to call it manually here
        showToast(t('toast.copied'));
      } catch (error) {
        console.error('Failed to set clipboard item:', error);
      }
    },
    [showToast, t]
  );

  const pasteStack = useCallback(async () => {
    if (selectedIds.length === 0) return;

    const itemsToPaste = selectedIds
      .map((id) => history.find((item) => item.id === id))
      .filter((item): item is ClipboardItem => !!item);

    if (itemsToPaste.length === 0) return;

    const [first, ...rest] = itemsToPaste;

    try {
      await invoke('set_paste_stack', { items: rest });
      await pasteItem(first);
      clearSelection();
      if (rest.length > 0) {
        showToast(t('toast.pasteStackStarted', { count: rest.length }));
      }
    } catch (error) {
      console.error('Failed to start paste stack:', error);
    }
  }, [clearSelection, history, pasteItem, selectedIds, showToast, t]);

  const deleteItem = useCallback(
    async (index: number) => {
      const confirmed = await confirm({
        title: t('deleteDialog.title'),
        description: t('deleteDialog.description'),
        actionText: t('deleteDialog.actionText'),
        variant: 'destructive',
      });
      if (!confirmed) return;

      const item = filteredHistory[index];
      if (!item?.id) return;

      try {
        await invoke('delete_item', { id: item.id });
        // Remove from local state - no need to reload full history
        setHistory((items) => items.filter((i) => i.id !== item.id));
        setTotalCount((count) => count - 1);
        await loadCollections(); // Update collection counts
        showToast(t('toast.deleted'));
      } catch (error) {
        console.error('Failed to delete item:', error);
      }
    },
    [filteredHistory, loadCollections, showToast, t]
  );

  const updateItemContent = useCallback(
    async (id: number, content: string, dataType: string, note?: string, html_content?: string) => {
      try {
        await invoke('update_clipboard_item_content', {
          id,
          content,
          dataType,
          note,
          htmlContent: html_content || null,
        });
        await loadHistory(true);
        showToast(t('collections.itemUpdated'));
      } catch (error) {
        console.error('Failed to update item content:', error);
        showToast(t('collections.updateFailed'));
      }
    },
    [loadHistory, showToast, t]
  );

  const addItem = useCallback(
    async (content: string) => {
      try {
        await invoke('set_clipboard_item', {
          content,
          kind: 'text',
          id: null,
        });
        await loadHistory(true);
        showToast(t('toast.copied'));
      } catch (error) {
        console.error('Failed to add item:', error);
      }
    },
    [loadHistory, showToast, t]
  );

  const toggleSensitive = useCallback(
    async (index: number) => {
      const item = filteredHistory[index];
      if (!item?.id) return;

      try {
        const newState = await invoke<boolean>('toggle_sensitive', { id: item.id });
        // Update local state only - no need to reload full history
        setHistory((items) =>
          items.map((historyItem) =>
            historyItem.id === item.id ? { ...historyItem, is_sensitive: newState } : historyItem
          )
        );
        showToast(newState ? t('toast.markedSensitive') : t('toast.unmarkedSensitive'));
      } catch (error) {
        console.error('Failed to toggle sensitive:', error);
      }
    },
    [filteredHistory, showToast, t]
  );

  const togglePin = useCallback(
    async (index: number) => {
      const item = filteredHistory[index];
      if (!item?.id) return;

      try {
        const newState = await invoke<boolean>('toggle_pin', { id: item.id });
        // Update local state and reorder - pinned items should be at top
        setHistory((items) => {
          const updatedItems = items.map((historyItem) =>
            historyItem.id === item.id ? { ...historyItem, is_pinned: newState } : historyItem
          );
          // Reorder: pinned items first, then by timestamp
          return updatedItems.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          });
        });
        showToast(newState ? t('toast.pinned') : t('toast.unpinned'));
      } catch (error) {
        console.error('Failed to toggle pin:', error);
      }
    },
    [filteredHistory, showToast, t]
  );

  const toggleSnippet = useCallback(
    async (id: number) => {
      try {
        const newState = await invoke<boolean>('toggle_snippet', { id });
        // Update local state only - no need to reload full history
        setHistory((items) =>
          items.map((item) => (item.id === id ? { ...item, is_snippet: newState } : item))
        );
        showToast(newState ? t('toast.snippetAdded') : t('toast.snippetRemoved'));
      } catch (error) {
        console.error('Failed to toggle snippet:', error);
      }
    },
    [showToast, t]
  );

  const clearHistory = useCallback(async () => {
    try {
      await invoke('clear_history');
      await loadCollections();
      await loadHistory(true);
      showToast(t('toast.historyCleared'));
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  }, [loadCollections, loadHistory, showToast, t]);

  const createCollection = useCallback(
    async (name: string) => {
      try {
        const collection = await invoke<Collection>('create_collection', { name });
        await loadCollections();
        showToast(t('collections.created'));
        return collection;
      } catch (error) {
        console.error('Failed to create collection:', error);
        showToast(t('collections.createFailed'));
        return null;
      }
    },
    [loadCollections, showToast, t]
  );

  const deleteCollection = useCallback(
    async (id: number) => {
      try {
        await invoke('delete_collection', { id });
        if (currentCollectionView === 'collection_detail' && activeCollectionId === id) {
          openAllCollectionsView();
        }
        await loadCollections();
        await loadHistory(true);
        showToast(t('collections.deleted'));
      } catch (error) {
        console.error('Failed to delete collection:', error);
        showToast(t('collections.deleteFailed'));
      }
    },
    [
      activeCollectionId,
      currentCollectionView,
      loadCollections,
      loadHistory,
      openAllCollectionsView,
      showToast,
      t,
    ]
  );

  const updateCollection = useCallback(
    async (id: number, name: string, icon?: string, color?: string) => {
      try {
        await invoke('update_collection', { id, name, icon, color });
        await loadCollections();
        showToast(t('collections.updated'));
      } catch (error) {
        console.error('Failed to update collection:', error);
        showToast(t('collections.updateFailed'));
      }
    },
    [loadCollections, showToast, t]
  );

  const setItemCollection = useCallback(
    async (itemId: number, collectionId: number | null) => {
      try {
        await invoke('set_item_collection', { itemId, collectionId });
        // Update local state - update the item's collection_id
        setHistory((items) =>
          items.map((item) =>
            item.id === itemId ? { ...item, collection_id: collectionId } : item
          )
        );
        await loadCollections(); // Update collection counts
        showToast(t('collections.itemUpdated'));
      } catch (error) {
        console.error('Failed to set item collection:', error);
        showToast(`${t('collections.updateFailed')}: ${error}`);
      }
    },
    [loadCollections, showToast, t]
  );

  const ocrImage = useCallback(
    async (item: ClipboardItem) => {
      if (item.kind !== 'image') return;

      try {
        const text = await invoke<string>('ocr_image', { imagePath: item.content });
        if (text) {
          await invoke('set_clipboard_item', {
            content: text,
            kind: 'text',
            id: null,
            htmlContent: null,
            screenshotId: item.id ?? null,
          });
          // clipboard-update event will trigger loadHistory automatically
          showToast(t('toast.ocrSuccess'));
          setPreviewItem({
            content: text,
            kind: 'text',
            timestamp: new Date().toISOString(),
            is_sensitive: item.is_sensitive,
            data_type: 'text',
            screenshot_id: item.id,
          });
        } else {
          showToast(t('toast.ocrEmpty'));
        }
      } catch (error) {
        console.error('OCR failed:', error);
        showToast(t('toast.ocrFailed'));
      }
    },
    [showToast, t]
  );

  const getImageSrc = useCallback((content: string) => {
    if (content.startsWith('/') || content.match(/^[a-zA-Z]:\\/)) {
      return convertFileSrc(content);
    }
    return `data:image/png;base64,${content}`;
  }, []);

  const scrollToSelected = useCallback(() => {
    requestAnimationFrame(() => {
      document.querySelector('.selected-item')?.scrollIntoView({ block: 'nearest' });
    });
  }, []);

  const setupClipboardListeners = useCallback(async () => {
    const unlisten: UnlistenFn = await listen(
      'clipboard-update',
      (event: { payload: ClipboardItem | null }) => {
        console.log('[clipboard-update] payload:', event.payload);
        const newItem = event.payload;
        if (newItem) {
          // Insert new item or move existing item to correct position
          setHistory((current) => {
            console.log(
              '[clipboard-update] current history ids:',
              current.map((i) => i.id)
            );
            const existingIndex = current.findIndex((item) => item.id === newItem.id);
            console.log(
              '[clipboard-update] existingIndex:',
              existingIndex,
              'newItem.id:',
              newItem.id,
              'is_pinned:',
              newItem.is_pinned
            );

            if (existingIndex >= 0) {
              // Item exists - remove from current position
              const filtered = current.filter((item) => item.id !== newItem.id);

              // Insert at correct position based on pinned status
              if (newItem.is_pinned) {
                // Pinned items go to the very top
                console.log('[clipboard-update] moving pinned item to top');
                return [newItem, ...filtered];
              } else {
                // Non-pinned items go after all pinned items
                const pinnedItems = filtered.filter((item) => item.is_pinned);
                const nonPinnedItems = filtered.filter((item) => !item.is_pinned);
                console.log('[clipboard-update] moving non-pinned item after pinned items');
                return [...pinnedItems, newItem, ...nonPinnedItems];
              }
            }
            // New item - insert at correct position
            if (newItem.is_pinned) {
              console.log('[clipboard-update] inserting new pinned item at top');
              return [newItem, ...current];
            } else {
              const pinnedItems = current.filter((item) => item.is_pinned);
              const nonPinnedItems = current.filter((item) => !item.is_pinned);
              console.log('[clipboard-update] inserting new non-pinned item after pinned items');
              return [...pinnedItems, newItem, ...nonPinnedItems];
            }
          });
          // Update total count
          setTotalCount((count) => count + 1);
          loadCollections();
        } else {
          // Fallback: no item data, do full reload
          console.log('[clipboard-update] no payload, doing full reload');
          loadCollections();
          loadHistory(true);
        }
      }
    );

    return unlisten;
  }, [loadCollections, loadHistory]);

  return {
    history,
    collections,
    totalCount,
    searchQuery,
    setSearchQuery,
    searchRegex,
    setSearchRegex,
    searchCaseSensitive,
    setSearchCaseSensitive,
    selectedIndex,
    setSelectedIndex,
    activeFilter,
    setActiveFilter,
    currentCollectionView,
    activeCollectionId,
    sourceApp,
    setSourceApp,
    currentPage,
    hasMore,
    isLoading,
    timeRange,
    setTimeRange,
    sortMode,
    setSortMode,
    previewItem,
    setPreviewItem,
    previewContent,
    selectedIds,
    setSelectedIds,
    filteredHistory,
    collectionScope,
    setCollectionView,
    openHistoryView,
    openAllCollectionsView,
    openCollectionView,
    loadHistory,
    loadMore,
    pasteItem,
    deleteItem,
    updateItemContent,
    addItem,
    toggleSensitive,
    togglePin,
    toggleSnippet,
    clearHistory,
    getImageSrc,
    scrollToSelected,
    setupClipboardListeners,
    loadCollections,
    createCollection,
    deleteCollection,
    updateCollection,
    setItemCollection,
    ocrImage,
    toggleSelection,
    clearSelection,
    pasteStack,
  };
}
