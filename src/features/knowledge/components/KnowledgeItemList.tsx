import { useTranslation } from 'react-i18next';
import { FileText, Clock, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTimeAgo } from '@/hooks/useTimeAgo';
import type { KnowledgeItem } from '@/types';

interface KnowledgeItemRowProps {
  item: KnowledgeItem;
  isSelected: boolean;
  onClick: () => void;
}

function KnowledgeItemRow({ item, isSelected, onClick }: KnowledgeItemRowProps) {
  const { formatTimeAgo } = useTimeAgo();
  const timeAgo = formatTimeAgo(item.updated_at);

  return (
    <button
      type="button"
      className={cn(
        'w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors border-b border-border/30 last:border-b-0',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/40 text-foreground'
      )}
      onClick={onClick}
    >
      <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate leading-snug">{item.title}</div>
        {item.summary && (
          <div className="text-[11px] text-muted-foreground truncate mt-0.5 leading-snug">
            {item.summary}
          </div>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{timeAgo}</span>
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
      {/* Search bar */}
      <div className="p-2 border-b border-border/40">
        <div className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch();
            }}
            className="flex-1 bg-transparent text-xs outline-none text-foreground placeholder-muted-foreground"
            placeholder={t('knowledge.searchPlaceholder')}
          />
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <FileText className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">{t('knowledge.noItems')}</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              {t('knowledge.noItemsHint')}
            </p>
          </div>
        ) : (
          items.map((item) => (
            <KnowledgeItemRow
              key={item.id}
              item={item}
              isSelected={selectedItem?.id === item.id}
              onClick={() => onSelectItem(item)}
            />
          ))
        )}
      </div>
    </div>
  );
}
