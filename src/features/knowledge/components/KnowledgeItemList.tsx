/**
 * KnowledgeItemList - Premium Card-based List Component
 *
 * Design: Notion + Apple Mail + Linear inspired
 * Features: Card layout, hover elevation, AI shimmer, search bar
 */
import { useTranslation } from 'react-i18next';
import { FileText, Clock, Search, Sparkles, Filter, SortAsc } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTimeAgo } from '@/hooks/useTimeAgo';
import type { KnowledgeItem } from '@/types';

interface KnowledgeCardProps {
  item: KnowledgeItem;
  isSelected: boolean;
  onClick: () => void;
}

function KnowledgeCard({ item, isSelected, onClick }: KnowledgeCardProps) {
  const { formatTimeAgo } = useTimeAgo();
  const timeAgo = formatTimeAgo(item.updated_at);

  return (
    <button
      type="button"
      className={cn(
        'kb-card w-full p-3 text-left transition-all duration-200 group/card',
        isSelected && 'kb-card-selected bg-accent/30'
      )}
      onClick={onClick}
    >
      {/* Header: Icon + Title */}
      <div className="flex items-start gap-2.5 mb-1.5">
        <FileText className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium leading-snug truncate text-foreground">
            {item.title}
          </div>
        </div>
        {/* AI indicator */}
        {item.summary && (
          <Sparkles className="w-3.5 h-3.5 shrink-0 text-primary opacity-60 group-hover/card:opacity-100 transition-opacity" />
        )}
      </div>

      {/* Summary preview */}
      {item.summary && (
        <div className="text-xs text-muted-foreground line-clamp-2 mb-2 leading-relaxed pl-6">
          {item.summary}
        </div>
      )}

      {/* Footer: Tags + Time */}
      <div className="flex items-center gap-2 pl-6">
        {/* Tags placeholder - could be added later */}
        <span className="text-[11px] text-muted-foreground/60">{timeAgo}</span>
      </div>
    </button>
  );
}

interface KnowledgeItemListProps {
  items: KnowledgeItem[];
  selectedItem: KnowledgeItem | null;
  searchQuery: string;
  isLoading: boolean;
  onSelectItem: (item: KnowledgeItem) => void;
  onSearchChange: (q: string) => void;
  onSearch: () => void;
}

export function KnowledgeItemList({
  items,
  selectedItem,
  searchQuery,
  isLoading,
  onSelectItem,
  onSearchChange,
  onSearch,
}: KnowledgeItemListProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full">
      {/* Search bar - Premium floating style */}
      <div className="p-3 border-b border-border/30">
        <div className="search-premium">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch();
            }}
            className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder-muted-foreground"
            placeholder={t('knowledge.searchPlaceholder')}
          />
          {/* AI search hint */}
          <Sparkles className="w-3.5 h-3.5 text-primary/40 shrink-0" />
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title={t('knowledge.filter')}
          >
            <Filter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title={t('knowledge.sort')}
          >
            <SortAsc className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Items - Card layout */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
            <Clock className="w-4 h-4 mr-2 animate-spin" />
            <span>{t('knowledge.loading')}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-3">
              <FileText className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">{t('knowledge.noItems')}</p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-[200px]">
              {t('knowledge.noItemsHint')}
            </p>
          </div>
        ) : (
          items.map((item) => (
            <KnowledgeCard
              key={item.id}
              item={item}
              isSelected={selectedItem?.id === item.id}
              onClick={() => onSelectItem(item)}
            />
          ))
        )}
      </div>

      {/* Footer: Count */}
      {!isLoading && items.length > 0 && (
        <div className="px-3 py-2 border-t border-border/30 text-xs text-muted-foreground">
          {items.length} {t('knowledge.itemsCount')}
        </div>
      )}
    </div>
  );
}

export default KnowledgeItemList;