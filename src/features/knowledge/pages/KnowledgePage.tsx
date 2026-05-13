import { useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { KnowledgeSidebar } from '../components/KnowledgeSidebar';
import { KnowledgeItemList } from '../components/KnowledgeItemList';
import { KnowledgeDetailPanel } from '../components/KnowledgeDetailPanel';
import { KnowledgeResizeHandle } from '../components/KnowledgeResizeHandle';
import { AiChatPanel } from '../components/AiChatPanel';
import { useKnowledge } from '../hooks/useKnowledge';
import { useToast } from '@/hooks/useToast';
import type { KnowledgeBacklink, KnowledgeItem, KnowledgeSearchResult } from '@/types';

const LEFT_PANEL_STORAGE_KEY = 'kb-left-panel-width';
const LEFT_MIN = 240;
const LEFT_MAX = 420;
const AI_PANEL_STORAGE_KEY = 'kb-ai-panel-width';
const AI_MIN = 260;
const AI_MAX = 480;

export interface KnowledgePageHandle {
  createNewKnowledge: () => Promise<void>;
  createNewGroup: (name: string) => Promise<void>;
}

export const KnowledgePage = forwardRef<
  KnowledgePageHandle,
  {
    pendingContent?: string | null;
    onPendingContentConsumed?: () => void;
    aiPanelOpen?: boolean;
    onToggleAiPanel?: () => void;
  }
>(function KnowledgePage(
  { pendingContent, onPendingContentConsumed, aiPanelOpen = false, onToggleAiPanel },
  ref
) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const kb = useKnowledge();
  const [backlinks, setBacklinks] = useState<KnowledgeBacklink[]>([]);
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[] | null>(null);

  // Left panel width — persisted to localStorage
  const [leftWidth, setLeftWidth] = useState(() => {
    const stored = Number(localStorage.getItem(LEFT_PANEL_STORAGE_KEY));
    return isFinite(stored) && stored > 0 ? Math.max(LEFT_MIN, Math.min(LEFT_MAX, stored)) : 280;
  });

  const handleResize = useCallback((delta: number) => {
    setLeftWidth((prev) => {
      const next = Math.max(LEFT_MIN, Math.min(LEFT_MAX, prev + delta));
      localStorage.setItem(LEFT_PANEL_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  // AI chat panel
  const [aiPanelWidth, setAiPanelWidth] = useState(() => {
    const stored = Number(localStorage.getItem(AI_PANEL_STORAGE_KEY));
    return isFinite(stored) && stored > 0 ? Math.max(AI_MIN, Math.min(AI_MAX, stored)) : 320;
  });

  const handleAiResize = useCallback((delta: number) => {
    setAiPanelWidth((prev) => {
      const next = Math.max(AI_MIN, Math.min(AI_MAX, prev - delta));
      localStorage.setItem(AI_PANEL_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  // Load data on mount
  useEffect(() => {
    kb.loadGroups();
    kb.loadItems();
  }, []);

  // Reload items when filter or search changes
  useEffect(() => {
    kb.loadItems();
  }, [kb.groupFilter, kb.searchQuery]);

  // FTS5 full-text search when query is non-empty
  useEffect(() => {
    if (!kb.searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const groupId =
      typeof kb.groupFilter === 'object'
        ? (kb.groupFilter as { groupId: number }).groupId
        : undefined;
    kb.searchKnowledge(kb.searchQuery, groupId).then(setSearchResults);
  }, [kb.searchQuery, kb.groupFilter]);

  // Load backlinks when selected item changes
  useEffect(() => {
    if (!kb.selectedItem) {
      setBacklinks([]);
      return;
    }
    kb.getBacklinks(kb.selectedItem.id).then(setBacklinks);
  }, [kb.selectedItem?.id]);

  // Handle clipboard → knowledge: create item from pending content
  useEffect(() => {
    if (!pendingContent) return;
    const createFromClipboard = async () => {
      try {
        const title =
          pendingContent.substring(0, 50).replace(/\n/g, ' ').trim() || t('knowledge.newKnowledge');
        const item = await kb.createItem({
          title,
          content: pendingContent,
          source_kind: 'clipboard',
        });
        const newItem = await invoke<KnowledgeItem | null>('get_knowledge_item', { id: item.id });
        if (newItem) {
          kb.setSelectedItem(newItem);
        }
      } catch {
        // ignore
      } finally {
        onPendingContentConsumed?.();
      }
    };
    createFromClipboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingContent]);

  const handleNewKnowledge = useCallback(async () => {
    try {
      const item = await kb.createItem({ title: t('knowledge.newKnowledge') });
      const newItem = await invoke<KnowledgeItem | null>('get_knowledge_item', { id: item.id });
      if (newItem) {
        kb.setSelectedItem(newItem);
      }
    } catch {
      // Will show blank form
      kb.setSelectedItem(null);
    }
  }, [kb, t]);

  const handleCreateGroup = useCallback(
    async (name: string) => {
      try {
        await kb.createGroup(name);
      } catch (e) {
        showToast(t('knowledge.saveFailed'));
      }
    },
    [kb, t, showToast]
  );

  // Expose imperative handle for MainWindow Titlebar actions
  useImperativeHandle(
    ref,
    () => ({
      createNewKnowledge: handleNewKnowledge,
      createNewGroup: handleCreateGroup,
    }),
    [handleNewKnowledge, handleCreateGroup]
  );

  const handleDeleteGroup = useCallback(
    async (id: number) => {
      try {
        await kb.deleteGroup(id);
      } catch (e) {
        showToast(t('knowledge.deleteFailed'));
      }
    },
    [kb, t, showToast]
  );

  const handleUpdateGroup = useCallback(
    async (id: number, name: string, icon?: string, color?: string) => {
      try {
        await kb.updateGroup(id, name, icon, color);
      } catch (e) {
        showToast(t('knowledge.saveFailed'));
      }
    },
    [kb, t, showToast]
  );

  const handleSave = useCallback(
    async (params: {
      id: number;
      title: string;
      summary?: string;
      content?: string;
      knowledge_group_id?: number;
      tags?: string[];
    }) => {
      try {
        await kb.updateItem(params);
      } catch (e) {
        showToast(t('knowledge.saveFailed'));
      }
    },
    [kb, t, showToast]
  );

  const handleArchive = useCallback(
    async (id: number) => {
      try {
        await kb.archiveItem(id);
      } catch (e) {
        showToast(t('knowledge.archiveFailed'));
      }
    },
    [kb, t, showToast]
  );

  const handleRestore = useCallback(
    async (id: number) => {
      try {
        await kb.restoreItem(id);
      } catch (e) {
        showToast(t('knowledge.restoreFailed'));
      }
    },
    [kb, t, showToast]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await kb.deleteItem(id);
      } catch (e) {
        showToast(t('knowledge.deleteFailed'));
      }
    },
    [kb, t, showToast]
  );

  return (
    <div className="flex h-full overflow-hidden bg-[var(--bg-base)]">
      {/* Left panel: nav + item list, drag-resizable */}
      <div
        style={{ width: leftWidth }}
        className="flex flex-col shrink-0 border-r border-border/30 overflow-hidden bg-[var(--bg-elevated)]"
      >
        {/* Navigation */}
        <KnowledgeSidebar
          groups={kb.groups}
          activeFilter={kb.groupFilter}
          onFilterChange={kb.setGroupFilter}
          onCreateGroup={handleCreateGroup}
          onDeleteGroup={handleDeleteGroup}
          onUpdateGroup={handleUpdateGroup}
          onNewKnowledge={handleNewKnowledge}
          integrated
        />

        {/* Item list */}
        <div className="flex-1 overflow-hidden border-t border-border/30">
          <KnowledgeItemList
            items={kb.items}
            selectedItem={kb.selectedItem}
            searchQuery={kb.searchQuery}
            searchResults={searchResults}
            isLoading={kb.isLoading}
            onSelectItem={kb.setSelectedItem}
            onSearchChange={(q) => {
              kb.setSearchQuery(q);
              if (!q.trim()) setSearchResults(null);
            }}
            onSearch={kb.loadItems}
            onSelectSearchResult={(result) => {
              const found = kb.items.find((i) => i.id === result.id);
              if (found) {
                kb.setSelectedItem(found);
              } else {
                invoke<KnowledgeItem | null>('get_knowledge_item', { id: result.id }).then(
                  (item) => {
                    if (item) kb.setSelectedItem(item);
                  }
                );
              }
            }}
          />
        </div>
      </div>

      {/* Resize handle */}
      <KnowledgeResizeHandle onResize={handleResize} />

      {/* Right panel: detail */}
      <div className="flex-1 min-w-0 overflow-hidden bg-[var(--bg-elevated)]">
        <KnowledgeDetailPanel
          item={kb.selectedItem}
          groups={kb.groups}
          backlinks={backlinks}
          allTags={kb.getAllTags()}
          onSave={handleSave}
          onArchive={handleArchive}
          onRestore={handleRestore}
          onDelete={handleDelete}
          onNewItem={handleNewKnowledge}
          onNavigateToItem={(id) => {
            const target = kb.items.find((i) => i.id === id);
            if (target) kb.setSelectedItem(target);
          }}
        />
      </div>

      {/* AI chat panel */}
      {aiPanelOpen && (
        <>
          <KnowledgeResizeHandle onResize={handleAiResize} />
          <div
            style={{ width: aiPanelWidth }}
            className="flex flex-col shrink-0 border-l border-border/30 overflow-hidden bg-[var(--bg-elevated)]"
          >
            <AiChatPanel attachedNote={kb.selectedItem} onClose={() => onToggleAiPanel?.()} />
          </div>
        </>
      )}
    </div>
  );
});
