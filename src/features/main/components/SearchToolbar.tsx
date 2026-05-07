/**
 * SearchToolbar - React Component
 *
 * Search input with regex and case-sensitive toggles.
 */
import { Search, CaseSensitive, Regex } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SearchToolbar({
  searchQuery,
  onSearchChange,
  searchCaseSensitive,
  onCaseSensitiveChange,
  searchRegex,
  onRegexChange,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchCaseSensitive: boolean;
  onCaseSensitiveChange: (value: boolean) => void;
  searchRegex: boolean;
  onRegexChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="relative flex items-center">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3">
        <Search className="h-4 w-4 text-muted-foreground" />
      </div>
      <Input
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full h-9 rounded-lg pl-10 pr-18 text-sm"
        placeholder={t('searchPlaceholder')}
      />
      <div className="absolute inset-y-0 right-1.5 z-10 flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 rounded ${
            searchCaseSensitive ? 'bg-accent text-accent-foreground' : ''
          }`}
          onClick={() => onCaseSensitiveChange(!searchCaseSensitive)}
          title={t('search.matchCase') || 'Match Case'}
        >
          <CaseSensitive className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 rounded ${
            searchRegex ? 'bg-accent text-accent-foreground' : ''
          }`}
          onClick={() => onRegexChange(!searchRegex)}
          title={t('search.regex') || 'Use Regular Expression'}
        >
          <Regex className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export default SearchToolbar;