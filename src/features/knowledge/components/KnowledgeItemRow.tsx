import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTimeAgo } from '@/hooks/useTimeAgo';
import type { KnowledgeItem, KnowledgeSearchResult } from '@/types';

interface KnowledgeItemRowProps {
  item: KnowledgeItem;
  isSelected: boolean;
  onClick: () => void;
}

export function KnowledgeItemRow({ item, isSelected, onClick }: KnowledgeItemRowProps) {
  const { formatTimeAgo } = useTimeAgo();

  return (
    <button
      type="button"
      className={cn(
        'w-full flex items-center gap-2 h-9 text-left transition-colors rounded-md relative',
        isSelected
          ? 'bg-primary/15 text-foreground font-medium'
          : 'text-foreground hover:bg-accent/20'
      )}
      onClick={onClick}
      title={item.title}
    >
      {isSelected && (
        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-primary" />
      )}
      <span className="flex items-center gap-2 flex-1 min-w-0 px-3">
        <FileText
          className={cn('size-4 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')}
        />
        <span className="flex-1 min-w-0 text-sm truncate">{item.title}</span>
        <span
          className={cn(
            'text-[11px] shrink-0',
            isSelected ? 'text-primary/70' : 'text-muted-foreground'
          )}
        >
          {formatTimeAgo(item.updated_at)}
        </span>
      </span>
    </button>
  );
}

interface KnowledgeSearchRowProps {
  result: KnowledgeSearchResult;
  isSelected: boolean;
  onClick: () => void;
}

export function KnowledgeSearchRow({ result, isSelected, onClick }: KnowledgeSearchRowProps) {
  return (
    <button
      type="button"
      className={cn(
        'w-full flex flex-col gap-0.5 py-1.5 text-left transition-colors rounded-md relative',
        isSelected ? 'bg-primary/15 text-foreground' : 'text-foreground hover:bg-accent/20'
      )}
      onClick={onClick}
      title={result.title}
    >
      {isSelected && (
        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-primary" />
      )}
      <div className={cn('flex items-center gap-2', isSelected ? 'pl-3 pr-3' : 'px-3')}>
        <FileText
          className={cn('size-4 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')}
        />
        <span className="flex-1 min-w-0 text-sm truncate font-medium">{result.title}</span>
      </div>
      {result.snippet && (
        <div
          className="text-xs text-muted-foreground line-clamp-2 leading-relaxed pl-6 [&_b]:text-primary [&_b]:font-semibold"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: result.snippet }}
        />
      )}
    </button>
  );
}
