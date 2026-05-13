import { useCallback } from 'react';
import { Power, ArrowUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ClipboardItem } from '@/types';
import type { useClipboard } from '@/hooks/useClipboard';
import type { useSettings } from '@/hooks/useSettings';
import type { useUpdater } from '@/hooks/useUpdater';
import { SearchToolbar } from '../components/SearchToolbar';
import { FilterToolbar } from '../components/FilterToolbar';
import { ClipboardList } from '../components/ClipboardList';

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

interface ClipboardPageProps {
  clipboard: ReturnType<typeof useClipboard>;
  settings: ReturnType<typeof useSettings>;
  updater: ReturnType<typeof useUpdater>;
  menuOpenIds: Set<number>;
  onMenuOpen: (id: number, isOpen: boolean) => void;
  onItemActionDone: () => Promise<void>;
  onOpenItemEditor: (item: ClipboardItem | null, noteOnly?: boolean) => void;
  onAddToCollection: (item: ClipboardItem) => void;
  onSaveToKnowledge: (item: ClipboardItem) => void;
}

export function ClipboardPage({
  clipboard,
  settings,
  updater,
  menuOpenIds,
  onMenuOpen,
  onItemActionDone,
  onOpenItemEditor,
  onAddToCollection,
  onSaveToKnowledge,
}: ClipboardPageProps) {
  const { t } = useTranslation();

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

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
      if (nearBottom && !clipboard.isLoading) clipboard.loadMore();
    },
    [clipboard]
  );

  return (
    <>
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
          onEdit={(item) => onOpenItemEditor(item)}
          onEditNote={(item) => onOpenItemEditor(item, true)}
          onAddToCollection={onAddToCollection}
          onMenuOpen={onMenuOpen}
          menuOpenIds={menuOpenIds}
          onActionDone={onItemActionDone}
          onScroll={handleScroll}
          isLoading={clipboard.isLoading}
          onSaveToKnowledge={onSaveToKnowledge}
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
    </>
  );
}
