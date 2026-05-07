/**
 * FilterToolbar - React Component
 *
 * Filter controls: type, collection, time range, sort, and total count.
 */
import {
  FileText,
  Image as ImageIcon,
  Files,
  Lock,
  Globe,
  Mail,
  Phone,
  Code,
  Scissors,
  Folder,
  Clock,
  ArrowUpDown,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from '@/components/ui/select';
import type { Collection } from '@/types';

// Filter types
type FilterType = 'all' | 'text' | 'image' | 'file' | 'sensitive' | 'snippet' | 'url' | 'email' | 'code' | 'phone';

// Get filter icon
function getFilterIcon(filter: FilterType) {
  switch (filter) {
    case 'text': return FileText;
    case 'image': return ImageIcon;
    case 'file': return Files;
    case 'sensitive': return Lock;
    case 'snippet': return Scissors;
    case 'url': return Globe;
    case 'email': return Mail;
    case 'code': return Code;
    case 'phone': return Phone;
    default: return null;
  }
}

export function FilterToolbar({
  activeFilter,
  onFilterChange,
  collections,
  collectionFilterValue,
  onCollectionFilterChange,
  timeRange,
  onTimeRangeChange,
  sortMode,
  onSortModeChange,
  totalCount,
}: {
  activeFilter: FilterType;
  onFilterChange: (value: FilterType) => void;
  collections: Collection[];
  collectionFilterValue: string;
  onCollectionFilterChange: (value: string) => void;
  timeRange: string | null;
  onTimeRangeChange: (value: string | null) => void;
  sortMode: string | null;
  onSortModeChange: (value: string | null) => void;
  totalCount: number;
}) {
  const { t } = useTranslation();

  const filterOptions: FilterType[] = ['all', 'text', 'image', 'file', 'sensitive', 'snippet', 'url', 'email', 'code', 'phone'];

  const timeRangeOptions = [
    { value: 'all', label: t('timeRange.all') },
    { value: 'today', label: t('timeRange.today') },
    { value: 'yesterday', label: t('timeRange.yesterday') },
    { value: 'week', label: t('timeRange.week') },
    { value: 'month', label: t('timeRange.month') },
  ];

  // Current filter label and icon
  const currentFilterLabel = t(`filters.${activeFilter}`);
  const CurrentFilterIcon = getFilterIcon(activeFilter);

  // Collection filter label
  const getCollectionFilterLabel = () => {
    if (collectionFilterValue === 'history') return t('collections.all');
    if (collectionFilterValue === 'all_collections') return t('collections.allCollections');
    if (collectionFilterValue.startsWith('collection:')) {
      const id = parseInt(collectionFilterValue.split(':')[1]);
      const col = collections.find((c) => c.id === id);
      return col?.name || '';
    }
    return t('collections.all');
  };

  // Time range label
  const currentTimeRangeLabel = timeRangeOptions.find((r) => r.value === (timeRange ?? 'all'))?.label || t('timeRange.all');

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto no-scrollbar">
        {/* Type Filter */}
        <Select value={activeFilter} onValueChange={(v) => onFilterChange(v as FilterType)}>
          <SelectTrigger className="min-w-[132px] shrink-0 rounded-lg border-border bg-card px-2.5 text-[10px] shadow-none h-7">
            <div className="flex min-w-0 items-center gap-2">
              {CurrentFilterIcon && <CurrentFilterIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <span className="truncate font-medium">{currentFilterLabel}</span>
            </div>
          </SelectTrigger>
          <SelectContent>
            {filterOptions.map((filter) => {
              const Icon = getFilterIcon(filter);
              return (
                <SelectItem key={filter} value={filter}>
                  <div className="flex items-center gap-2">
                    {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    <span>{t(`filters.${filter}`)}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {/* Collection Filter */}
        <Select value={collectionFilterValue} onValueChange={onCollectionFilterChange}>
          <SelectTrigger className="min-w-[156px] shrink-0 rounded-lg border-border bg-card px-2.5 text-[10px] shadow-none h-7">
            <div className="flex min-w-0 items-center gap-2">
              <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{getCollectionFilterLabel()}</span>
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>{t('collections.scope')}</SelectLabel>
              <SelectItem value="history">{t('collections.all')}</SelectItem>
              <SelectItem value="all_collections">{t('collections.allCollections')}</SelectItem>
            </SelectGroup>
            {collections.length > 0 && <SelectSeparator />}
            {collections.length > 0 && (
              <SelectGroup>
                <SelectLabel>{t('collections.saved')}</SelectLabel>
                {collections.map((collection) => (
                  <SelectItem key={collection.id} value={`collection:${collection.id}`}>
                    {collection.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>

        {/* Time Range */}
        <Select value={timeRange ?? 'all'} onValueChange={(v) => onTimeRangeChange(v === 'all' ? null : v)}>
          <SelectTrigger className="min-w-[116px] shrink-0 rounded-lg border-border bg-card px-2.5 text-[10px] shadow-none h-7">
            <div className="flex min-w-0 items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{currentTimeRangeLabel}</span>
            </div>
          </SelectTrigger>
          <SelectContent>
            {timeRangeOptions.map((range) => (
              <SelectItem key={range.value} value={range.value}>
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort Mode */}
        <Select value={sortMode ?? 'recent'} onValueChange={(v) => onSortModeChange(v === 'recent' ? null : v)}>
          <SelectTrigger className="min-w-[104px] shrink-0 rounded-lg border-border bg-card px-2.5 text-[10px] shadow-none h-7">
            <div className="flex min-w-0 items-center gap-1.5">
              <ArrowUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">
                {sortMode === 'oldest' ? t('sort.oldest') : sortMode === 'source_app' ? t('sort.sourceApp') : t('sort.recent')}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">{t('sort.recent')}</SelectItem>
            <SelectItem value="oldest">{t('sort.oldest')}</SelectItem>
            <SelectItem value="source_app">{t('sort.sourceApp')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Total Count */}
      <div className="shrink-0 rounded-full border border-border/80 bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        {totalCount} {t('stats.items')}
      </div>
    </div>
  );
}

export default FilterToolbar;