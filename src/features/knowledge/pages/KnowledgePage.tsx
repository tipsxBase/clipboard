import { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { KnowledgeGroupList } from '../components/KnowledgeGroupList';
import { KnowledgeItemList } from '../components/KnowledgeItemList';
import { KnowledgeDetailPanel } from '../components/KnowledgeDetailPanel';
import { useKnowledge } from '../hooks/useKnowledge';
import { useToast } from '@/hooks/useToast';
import type { KnowledgeItem } from '@/types';

export function KnowledgePage({
  pendingContent,
  onPendingContentConsumed,
}: {
  pendingContent?: string | null;
  onPendingContentConsumed?: () => void;
} = {}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const kb = useKnowledge();

  // Load data on mount
  useEffect(() => {
    kb.loadGroups();
    kb.loadItems();
  }, []);

  // Reload items when filter or search changes
  useEffect(() => {
    kb.loadItems();
  }, [kb.groupFilter, kb.searchQuery]);

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
    <div className="flex h-full overflow-hidden">
      {/* Left: Group list */}
      <div className="w-40 shrink-0 border-r border-border/40 overflow-hidden flex flex-col">
        <KnowledgeGroupList
          groups={kb.groups}
          activeFilter={kb.groupFilter}
          onFilterChange={kb.setGroupFilter}
          onCreateGroup={handleCreateGroup}
          onDeleteGroup={handleDeleteGroup}
          onUpdateGroup={handleUpdateGroup}
          onNewKnowledge={handleNewKnowledge}
        />
      </div>

      {/* Middle: Item list */}
      <div className="w-44 shrink-0 border-r border-border/40 overflow-hidden flex flex-col">
        <KnowledgeItemList
          items={kb.items}
          selectedItem={kb.selectedItem}
          searchQuery={kb.searchQuery}
          isLoading={kb.isLoading}
          onSelectItem={kb.setSelectedItem}
          onSearchChange={kb.setSearchQuery}
          onSearch={kb.loadItems}
        />
      </div>

      {/* Right: Detail panel */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <KnowledgeDetailPanel
          item={kb.selectedItem}
          groups={kb.groups}
          onSave={handleSave}
          onArchive={handleArchive}
          onRestore={handleRestore}
          onDelete={handleDelete}
          onNewItem={handleNewKnowledge}
        />
      </div>
    </div>
  );
}
