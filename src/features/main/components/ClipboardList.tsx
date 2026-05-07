/**
 * ClipboardList - React Component
 *
 * List of clipboard items with hover actions, selection state, and compact mode support.
 */
import {
  FileText,
  Image as ImageIcon,
  Lock,
  Unlock,
  X,
  Eye,
  Pin,
  PinOff,
  FolderPlus,
  Edit2,
  NotepadText,
  Scissors,
  Files,
  Globe,
  Mail,
  Phone,
  Code,
  Command,
  FileImage,
  FileAudio,
  FileVideo,
  FileArchive,
  FileSpreadsheet,
  FileCode,
  Folder,
  Star,
  Heart,
  Bookmark,
  Tag,
  Box,
  Briefcase,
  Home,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LocalImage } from '@/components/LocalImage';
import { HighlightText } from '@/components/HighlightText';
import { QuickActionMenu } from '@/components/QuickActionMenu';
import { useTimeAgo } from '@/hooks/useTimeAgo';
import type { ClipboardItem, Collection } from '@/types';

// File icon helper
function getFileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  if (!ext) return Files;
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(ext)) return FileImage;
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) return FileAudio;
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv'].includes(ext)) return FileVideo;
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return FileArchive;
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return FileSpreadsheet;
  if (
    ['js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'py', 'rs', 'java', 'c', 'cpp'].includes(ext)
  )
    return FileCode;
  if (['doc', 'docx', 'pdf', 'txt', 'rtf', 'md'].includes(ext)) return FileText;
  return Files;
}

// Item icon helper
function getItemIcon(item: ClipboardItem) {
  if (item.kind === 'image') return ImageIcon;
  if (item.kind === 'file') return Files;
  switch (item.data_type) {
    case 'url':
      return Globe;
    case 'email':
      return Mail;
    case 'code':
      return Code;
    case 'phone':
      return Phone;
    default:
      return FileText;
  }
}

// Get files list from JSON
function getFilesList(content: string): string[] {
  try {
    return JSON.parse(content);
  } catch {
    return [];
  }
}

// Collection icon helper
function getCollectionIconComponent(icon?: string) {
  switch (icon) {
    case 'star':
      return Star;
    case 'heart':
      return Heart;
    case 'bookmark':
      return Bookmark;
    case 'tag':
      return Tag;
    case 'box':
      return Box;
    case 'briefcase':
      return Briefcase;
    case 'home':
      return Home;
    default:
      return Folder;
  }
}

// Clipboard item row component
function ClipboardItemRow({
  item,
  index,
  isSelected,
  compactMode,
  searchQuery,
  searchRegex,
  searchCaseSensitive,
  collection,
  shouldShowCollectionBadge,
  onItemClick,
  onItemMouseEnter,
  onTogglePin,
  onToggleSnippet,
  onToggleSensitive,
  onPreview,
  onDelete,
  onEdit,
  onEditNote,
  onAddToCollection,
  onMenuOpen,
  isMenuOpen,
  onActionDone,
}: {
  item: ClipboardItem;
  index: number;
  isSelected: boolean;
  compactMode: boolean;
  searchQuery: string;
  searchRegex: boolean;
  searchCaseSensitive: boolean;
  collection?: Collection | null;
  shouldShowCollectionBadge: boolean;
  onItemClick: (item: ClipboardItem, e: React.MouseEvent) => void;
  onItemMouseEnter: (index: number) => void;
  onTogglePin: (index: number) => void;
  onToggleSnippet: (id: number) => void;
  onToggleSensitive: (index: number) => void;
  onPreview: (item: ClipboardItem) => void;
  onDelete: (index: number) => void;
  onEdit: (item: ClipboardItem) => void;
  onEditNote: (item: ClipboardItem) => void;
  onAddToCollection: (item: ClipboardItem) => void;
  onMenuOpen: (id: number, isOpen: boolean) => void;
  isMenuOpen: boolean;
  onActionDone: () => void;
}) {
  const { t } = useTranslation();
  const { formatTimeAgo } = useTimeAgo();

  const Icon = getItemIcon(item);
  const CollectionIcon = collection ? getCollectionIconComponent(collection.icon) : Folder;

  return (
    <div
      className={`group relative app-list-item cursor-pointer hover:border-transparent hover:bg-accent/70 ${
        isSelected ? 'app-list-item-active selected-item' : ''
      } ${compactMode ? 'p-1.5' : 'p-3'}`}
      onClick={(e) => onItemClick(item, e)}
      onMouseEnter={() => onItemMouseEnter(index)}
    >
      {/* Content */}
      <div className={`flex gap-3 ${compactMode ? 'items-center' : 'items-start'}`}>
        {/* Icon */}
        <div
          className={`rounded-md bg-muted text-muted-foreground shrink-0 relative ${compactMode ? 'p-1' : 'mt-0.5 p-1.5'}`}
        >
          <Icon className={compactMode ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          {item.is_pinned && (
            <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5 shadow-sm">
              <Pin className="w-2 h-2" />
            </div>
          )}
        </div>

        {/* Text Content */}
        <div className="flex-1 min-w-0">
          {/* Non-compact mode: timestamp, badges */}
          {!compactMode && (
            <div className="flex justify-between items-baseline mb-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground opacity-70">
                  {formatTimeAgo(item.timestamp)}
                </span>
                {shouldShowCollectionBadge && collection && (
                  <div className="flex items-center gap-1 rounded-md border border-primary/15 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    <CollectionIcon
                      className="h-3 w-3"
                      style={{ color: collection.color || 'currentColor' }}
                    />
                    <span className="max-w-24 truncate">{collection.name}</span>
                  </div>
                )}
                {item.html_content && (
                  <div className="flex items-center gap-1 bg-sky-500/10 text-sky-500 px-1.5 py-0.5 rounded text-[10px]">
                    <Code className="w-3 h-3" />
                    <span className="max-w-[40px] truncate">HTML</span>
                  </div>
                )}
                {item.source_app && (
                  <span
                    className="text-[10px] text-muted-foreground/60 truncate max-w-[100px]"
                    title={item.source_app}
                  >
                    {item.source_app}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Note (non-compact) */}
          {!compactMode && item.note && (
            <p className="text-sm font-semibold text-foreground mb-0.5">{item.note}</p>
          )}

          {/* Compact mode */}
          {compactMode ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0 flex items-center gap-2">
                {item.kind === 'text' ? (
                  <p
                    className={`text-xs text-foreground line-clamp-1 break-all font-medium flex-1 ${item.is_sensitive ? 'blur-sm group-hover:blur-none transition-all' : ''} ${item.note ? 'text-muted-foreground opacity-80' : ''}`}
                  >
                    <HighlightText
                      text={item.content}
                      query={searchQuery}
                      isRegex={searchRegex}
                      isCaseSensitive={searchCaseSensitive}
                    />
                  </p>
                ) : item.kind === 'file' ? (
                  <p className="text-xs text-foreground line-clamp-1 break-all font-medium flex-1">
                    {getFilesList(item.content).length} Files: {getFilesList(item.content)[0]}
                  </p>
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs text-muted-foreground italic">[Image]</span>
                  </div>
                )}
              </div>
              {shouldShowCollectionBadge && collection && (
                <div
                  className="flex shrink-0 items-center gap-1 rounded-md border border-primary/15 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary"
                  title={collection.name}
                >
                  <CollectionIcon
                    className="h-2.5 w-2.5"
                    style={{ color: collection.color || 'currentColor' }}
                  />
                  <span className="max-w-16 truncate">{collection.name}</span>
                </div>
              )}
              <span className="text-[9px] font-mono text-muted-foreground opacity-50 shrink-0">
                {formatTimeAgo(item.timestamp)}
              </span>
            </div>
          ) : (
            <>
              {item.kind === 'text' ? (
                <p
                  className={`text-sm text-foreground line-clamp-2 break-all font-medium ${item.is_sensitive ? 'blur-sm group-hover:blur-none transition-all' : ''} ${item.note ? 'text-muted-foreground text-xs' : ''}`}
                >
                  <HighlightText
                    text={item.content}
                    query={searchQuery}
                    isRegex={searchRegex}
                    isCaseSensitive={searchCaseSensitive}
                  />
                </p>
              ) : item.kind === 'file' ? (
                <div className="flex flex-col gap-1 mt-1">
                  {getFilesList(item.content)
                    .slice(0, 3)
                    .map((file, i) => {
                      const FileIcon = getFileIcon(file);
                      return (
                        <div
                          key={i}
                          className="text-xs text-foreground bg-muted/50 px-2 py-1 rounded truncate flex items-center gap-2"
                        >
                          <FileIcon className="shrink-0 w-4 h-4 text-muted-foreground" />
                          <span className="truncate">{file}</span>
                        </div>
                      );
                    })}
                  {getFilesList(item.content).length > 3 && (
                    <div className="text-[10px] text-muted-foreground pl-1">
                      + {getFilesList(item.content).length - 3} more
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-16 w-full rounded-md overflow-hidden bg-muted/50 border border-border mt-1">
                  <LocalImage
                    src={item.content}
                    className="h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Hover Actions */}
      <div
        className={`absolute right-2 top-2 flex gap-1 rounded-md border border-border bg-card p-0.5 shadow-sm transition-opacity ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <QuickActionMenu
          item={item}
          onActionDone={onActionDone}
          onMenuOpen={(v) => item.id && onMenuOpen(item.id, v)}
        />
        {item.kind !== 'image' && !item.is_sensitive && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-primary"
            title={t('actions.edit')}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(item);
            }}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className={`h-6 w-6 text-muted-foreground hover:text-primary ${item.note ? 'text-primary' : ''}`}
          title={t('actions.editNote')}
          onClick={(e) => {
            e.stopPropagation();
            onEditNote(item);
          }}
        >
          <NotepadText className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-primary"
          title={item.collection_id ? t('actions.moveToCollection') : t('actions.addToCollection')}
          onClick={(e) => {
            e.stopPropagation();
            onAddToCollection(item);
          }}
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={`h-6 w-6 ${item.is_pinned ? 'text-primary' : 'text-muted-foreground'}`}
          title={item.is_pinned ? t('actions.unpin') : t('actions.pin')}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(index);
          }}
        >
          {item.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={`h-6 w-6 ${item.is_snippet ? 'text-orange-500' : 'text-muted-foreground'}`}
          title={item.is_snippet ? t('actions.removeSnippet') : t('actions.addSnippet')}
          onClick={(e) => {
            e.stopPropagation();
            if (item.id) onToggleSnippet(item.id);
          }}
        >
          <Scissors className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={`h-6 w-6 ${item.is_sensitive ? 'text-yellow-500' : 'text-muted-foreground'}`}
          title={item.is_sensitive ? t('actions.sensitiveTooltip') : t('actions.markSensitive')}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSensitive(index);
          }}
        >
          {item.is_sensitive ? (
            <Lock className="w-3.5 h-3.5" />
          ) : (
            <Unlock className="w-3.5 h-3.5" />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-primary"
          title={t('actions.preview')}
          onClick={(e) => {
            e.stopPropagation();
            onPreview(item);
          }}
        >
          <Eye className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          title={t('actions.delete')}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(index);
          }}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Sensitive lock icon (always visible) */}
      {item.is_sensitive && (
        <div className="absolute top-2 right-2 opacity-100 group-hover:opacity-0 transition-opacity pointer-events-none">
          <Lock className="w-3 h-3 text-yellow-600/50" />
        </div>
      )}
    </div>
  );
}

export function ClipboardList({
  items,
  selectedIndex,
  compactMode,
  searchQuery,
  searchRegex,
  searchCaseSensitive,
  collections,
  currentCollectionView,
  onItemClick,
  onItemMouseEnter,
  onTogglePin,
  onToggleSnippet,
  onToggleSensitive,
  onPreview,
  onDelete,
  onEdit,
  onEditNote,
  onAddToCollection,
  onMenuOpen,
  menuOpenIds,
  onActionDone,
  onScroll,
  isLoading,
}: {
  items: ClipboardItem[];
  selectedIndex: number;
  compactMode: boolean;
  searchQuery: string;
  searchRegex: boolean;
  searchCaseSensitive: boolean;
  collections: Collection[];
  currentCollectionView: string;
  onItemClick: (item: ClipboardItem, e: React.MouseEvent) => void;
  onItemMouseEnter: (index: number) => void;
  onTogglePin: (index: number) => void;
  onToggleSnippet: (id: number) => void;
  onToggleSensitive: (index: number) => void;
  onPreview: (item: ClipboardItem) => void;
  onDelete: (index: number) => void;
  onEdit: (item: ClipboardItem) => void;
  onEditNote: (item: ClipboardItem) => void;
  onAddToCollection: (item: ClipboardItem) => void;
  onMenuOpen: (id: number, isOpen: boolean) => void;
  menuOpenIds: Set<number>;
  onActionDone: () => void;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation();

  // Get collection helper
  const getCollection = (id?: number | null) => {
    if (!id) return null;
    return collections.find((c) => c.id === id) || null;
  };

  // Should show collection badge
  const shouldShowCollectionBadge = (item: ClipboardItem) => {
    return currentCollectionView !== 'collection_detail' && !!getCollection(item.collection_id);
  };

  // Empty state
  const emptyStateTitle = searchQuery ? t('emptyState.noResults') : t('emptyState.title');
  const emptyStateSubtitle = searchQuery
    ? t('emptyState.noResultsSubtitle')
    : t('emptyState.subtitle');

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1" onScroll={onScroll}>
      {items.map((item, index) => (
        <ClipboardItemRow
          key={item.id || item.timestamp}
          item={item}
          index={index}
          isSelected={index === selectedIndex}
          compactMode={compactMode}
          searchQuery={searchQuery}
          searchRegex={searchRegex}
          searchCaseSensitive={searchCaseSensitive}
          collection={getCollection(item.collection_id)}
          shouldShowCollectionBadge={shouldShowCollectionBadge(item)}
          onItemClick={onItemClick}
          onItemMouseEnter={onItemMouseEnter}
          onTogglePin={onTogglePin}
          onToggleSnippet={onToggleSnippet}
          onToggleSensitive={onToggleSensitive}
          onPreview={onPreview}
          onDelete={onDelete}
          onEdit={onEdit}
          onEditNote={onEditNote}
          onAddToCollection={onAddToCollection}
          onMenuOpen={onMenuOpen}
          isMenuOpen={item.id ? menuOpenIds.has(item.id) : false}
          onActionDone={onActionDone}
        />
      ))}

      {/* Empty State */}
      {items.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
          <Command className="w-8 h-8 mb-2 opacity-20" />
          <p className="text-sm">{emptyStateTitle}</p>
          <p className="text-xs opacity-50 mt-1">{emptyStateSubtitle}</p>
        </div>
      )}
    </div>
  );
}

export default ClipboardList;
