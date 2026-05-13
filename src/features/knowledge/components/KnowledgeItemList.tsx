import { useTranslation } from 'react-i18next';
import { FileText, Clock, Search } from 'lucide-react';
import type { KnowledgeItem, KnowledgeSearchResult } from '@/types';
import { KnowledgeItemRow, KnowledgeSearchRow } from './KnowledgeItemRow';

interface KnowledgeItemListProps {
  items: KnowledgeItem[];
  selectedItem: KnowledgeItem | null;
  searchQuery: string;
  searchResults?: KnowledgeSearchResult[] | null;
  isLoading: boolean;
  onSelectItem: (item: KnowledgeItem) => void;
  onSearchChange: (q: string) => void;
  onSearch: () => void;
  onSelectSearchResult?: (result: KnowledgeSearchResult) => void;
}

export function KnowledgeItemList({
  items,
  selectedItem,
  searchQuery,
  searchResults,
  isLoading,
  onSelectItem,
  onSearchChange,
  onSearch,
  onSelectSearchResult,
}: KnowledgeItemListProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-2 py-1.5 border-b border-border/30">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/40 text-muted-foreground">
          <Search className="size-3.5 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch();
            }}
            className="flex-1 bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground/60"
            placeholder={t('knowledge.searchPlaceholder')}
          />
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-1.5 py-1.5 space-y-0.5 scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
            <Clock className="size-4 mr-2 animate-spin" />
            <span>{t('knowledge.loading')}</span>
          </div>
        ) : searchResults !== null && searchResults !== undefined ? (
          searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-3">
                <Search className="size-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">{t('knowledge.noItems')}</p>
            </div>
          ) : (
            searchResults.map((result) => (
              <KnowledgeSearchRow
                key={result.id}
                result={result}
                isSelected={selectedItem?.id === result.id}
                onClick={() => onSelectSearchResult?.(result)}
              />
            ))
          )
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-3">
              <FileText className="size-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">{t('knowledge.noItems')}</p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-[200px]">
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

      {/* Footer: Count */}
      {!isLoading &&
        (searchResults !== null && searchResults !== undefined
          ? searchResults.length > 0
          : items.length > 0) && (
          <div className="px-3 py-1.5 border-t border-border/30 text-xs text-muted-foreground">
            {searchResults !== null && searchResults !== undefined
              ? `${searchResults.length} ${t('knowledge.itemsCount')}`
              : `${items.length} ${t('knowledge.itemsCount')}`}
          </div>
        )}
    </div>
  );
}

export default KnowledgeItemList;
