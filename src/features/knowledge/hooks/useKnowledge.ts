import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { KnowledgeGroup, KnowledgeItem } from '@/types';

export type KnowledgeGroupFilter =
  | 'all'
  | 'ungrouped'
  | 'archived'
  | 'ai'
  | 'favorites'
  | 'recent'
  | { groupId: number };

export interface UseKnowledgeReturn {
  groups: KnowledgeGroup[];
  items: KnowledgeItem[];
  selectedItem: KnowledgeItem | null;
  groupFilter: KnowledgeGroupFilter;
  searchQuery: string;
  isLoading: boolean;

  setGroupFilter: (filter: KnowledgeGroupFilter) => void;
  setSearchQuery: (q: string) => void;
  setSelectedItem: (item: KnowledgeItem | null) => void;

  loadGroups: () => Promise<void>;
  loadItems: () => Promise<void>;

  createGroup: (name: string, icon?: string, color?: string) => Promise<KnowledgeGroup>;
  updateGroup: (id: number, name: string, icon?: string, color?: string) => Promise<void>;
  deleteGroup: (id: number) => Promise<void>;

  createItem: (params: {
    title: string;
    summary?: string;
    content?: string;
    knowledge_group_id?: number;
    source_kind?: string;
  }) => Promise<KnowledgeItem>;

  updateItem: (params: {
    id: number;
    title: string;
    summary?: string;
    content?: string;
    knowledge_group_id?: number;
    status?: string;
  }) => Promise<void>;

  archiveItem: (id: number) => Promise<void>;
  restoreItem: (id: number) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;

  createFromClipboard: (clipboardItemId: number) => Promise<KnowledgeItem | null>;
}

export function useKnowledge(): UseKnowledgeReturn {
  const [groups, setGroups] = useState<KnowledgeGroup[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null);
  const [groupFilter, setGroupFilter] = useState<KnowledgeGroupFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const searchQueryRef = useRef(searchQuery);
  const groupFilterRef = useRef(groupFilter);
  searchQueryRef.current = searchQuery;
  groupFilterRef.current = groupFilter;

  const loadGroups = useCallback(async () => {
    try {
      const g = await invoke<KnowledgeGroup[]>('get_knowledge_groups');
      setGroups(g);
    } catch (e) {
      console.error('Failed to load knowledge groups:', e);
    }
  }, []);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const filter = groupFilterRef.current;
      const query = searchQueryRef.current || undefined;

      let includeUngrouped = false;

      if (filter === 'all') {
        // List active items across all groups
        const result = await invoke<KnowledgeItem[]>('list_knowledge_items', {
          query,
          knowledgeGroupId: null,
          includeUngrouped: true,
        });
        setItems(result.filter((i) => i.status === 'active'));
        return;
      }

      if (filter === 'ungrouped') {
        includeUngrouped = true;
        const result = await invoke<KnowledgeItem[]>('list_knowledge_items', {
          query,
          knowledgeGroupId: null,
          includeUngrouped: true,
        });
        setItems(result.filter((i) => i.status === 'active' && !i.knowledge_group_id));
        return;
      }

      if (filter === 'archived') {
        const result = await invoke<KnowledgeItem[]>('list_knowledge_items', {
          query,
          knowledgeGroupId: null,
          includeUngrouped: true,
        });
        setItems(result.filter((i) => i.status === 'archived'));
        return;
      }

      // Group filter
      const groupId = (filter as { groupId: number }).groupId;
      const result = await invoke<KnowledgeItem[]>('list_knowledge_items', {
        query,
        knowledgeGroupId: groupId,
        includeUngrouped,
      });
      setItems(result.filter((i) => i.status === 'active'));
    } catch (e) {
      console.error('Failed to load knowledge items:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSetGroupFilter = useCallback((filter: KnowledgeGroupFilter) => {
    groupFilterRef.current = filter;
    setGroupFilter(filter);
    setSelectedItem(null);
  }, []);

  const handleSetSearchQuery = useCallback((q: string) => {
    searchQueryRef.current = q;
    setSearchQuery(q);
  }, []);

  const createGroup = useCallback(
    async (name: string, icon?: string, color?: string): Promise<KnowledgeGroup> => {
      const group = await invoke<KnowledgeGroup>('create_knowledge_group', {
        name,
        icon: icon ?? 'folder',
        color: color ?? '',
      });
      await loadGroups();
      return group;
    },
    [loadGroups]
  );

  const updateGroup = useCallback(
    async (id: number, name: string, icon?: string, color?: string) => {
      await invoke('update_knowledge_group', { id, name, icon, color });
      await loadGroups();
    },
    [loadGroups]
  );

  const deleteGroup = useCallback(
    async (id: number) => {
      await invoke('delete_knowledge_group', { id });
      await loadGroups();
      await loadItems();
    },
    [loadGroups, loadItems]
  );

  const createItem = useCallback(
    async (params: {
      title: string;
      summary?: string;
      content?: string;
      knowledge_group_id?: number;
      source_kind?: string;
    }): Promise<KnowledgeItem> => {
      const item = await invoke<KnowledgeItem>('create_knowledge_item', {
        title: params.title,
        summary: params.summary ?? '',
        content: params.content ?? '',
        knowledgeGroupId: params.knowledge_group_id ?? null,
        sourceKind: params.source_kind ?? 'manual',
      });
      await loadItems();
      return item;
    },
    [loadItems]
  );

  const updateItem = useCallback(
    async (params: {
      id: number;
      title: string;
      summary?: string;
      content?: string;
      knowledge_group_id?: number;
      status?: string;
    }) => {
      await invoke('update_knowledge_item', {
        id: params.id,
        title: params.title,
        summary: params.summary ?? '',
        content: params.content ?? '',
        knowledgeGroupId: params.knowledge_group_id ?? null,
        sourceKind: 'manual',
        status: params.status ?? 'active',
      });
      // Refresh selected item
      const updated = await invoke<KnowledgeItem | null>('get_knowledge_item', { id: params.id });
      if (updated) setSelectedItem(updated);
      await loadItems();
    },
    [loadItems]
  );

  const archiveItem = useCallback(
    async (id: number) => {
      const current = await invoke<KnowledgeItem | null>('get_knowledge_item', { id });
      if (!current) return;
      await invoke('update_knowledge_item', {
        id,
        title: current.title,
        summary: current.summary,
        content: current.content,
        knowledgeGroupId: current.knowledge_group_id ?? null,
        sourceKind: current.source_kind,
        status: 'archived',
      });
      setSelectedItem(null);
      await loadItems();
    },
    [loadItems]
  );

  const restoreItem = useCallback(
    async (id: number) => {
      const current = await invoke<KnowledgeItem | null>('get_knowledge_item', { id });
      if (!current) return;
      await invoke('update_knowledge_item', {
        id,
        title: current.title,
        summary: current.summary,
        content: current.content,
        knowledgeGroupId: current.knowledge_group_id ?? null,
        sourceKind: current.source_kind,
        status: 'active',
      });
      setSelectedItem(null);
      await loadItems();
    },
    [loadItems]
  );

  const deleteItem = useCallback(
    async (id: number) => {
      await invoke('delete_knowledge_item', { id });
      setSelectedItem(null);
      await loadItems();
    },
    [loadItems]
  );

  const createFromClipboard = useCallback(
    async (clipboardItemId: number): Promise<KnowledgeItem | null> => {
      try {
        const seed = await invoke<{
          title: string;
          content: string;
          source_kind: string;
          knowledge_group_id?: number;
        }>('prepare_knowledge_seed_from_history', {
          id: clipboardItemId,
          knowledgeGroupId: null,
        });
        const item = await invoke<KnowledgeItem>('create_knowledge_item', {
          title: seed.title,
          summary: '',
          content: seed.content,
          knowledgeGroupId: seed.knowledge_group_id ?? null,
          sourceKind: seed.source_kind,
        });
        await loadItems();
        return item;
      } catch (e) {
        console.error('Failed to create from clipboard:', e);
        return null;
      }
    },
    [loadItems]
  );

  return {
    groups,
    items,
    selectedItem,
    groupFilter,
    searchQuery,
    isLoading,

    setGroupFilter: handleSetGroupFilter,
    setSearchQuery: handleSetSearchQuery,
    setSelectedItem,

    loadGroups,
    loadItems,

    createGroup,
    updateGroup,
    deleteGroup,

    createItem,
    updateItem,
    archiveItem,
    restoreItem,
    deleteItem,

    createFromClipboard,
  };
}
