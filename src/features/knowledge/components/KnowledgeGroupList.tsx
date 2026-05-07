import { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Folder,
  Star,
  Heart,
  Bookmark,
  Tag,
  Box,
  Briefcase,
  Home,
  Code,
  Book,
  Lightbulb,
  Pin,
  Flag,
  Archive,
  FolderOpen,
  MoreHorizontal,
  Check,
  X,
  Trash2,
  Pencil,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { KnowledgeGroup } from '@/types';
import type { KnowledgeGroupFilter } from '../hooks/useKnowledge';

const ICON_MAP: Record<string, React.ElementType> = {
  folder: Folder,
  star: Star,
  heart: Heart,
  bookmark: Bookmark,
  tag: Tag,
  box: Box,
  briefcase: Briefcase,
  home: Home,
  code: Code,
  book: Book,
  lightbulb: Lightbulb,
  pin: Pin,
  flag: Flag,
};

function GroupIcon({ icon, color }: { icon: string; color?: string }) {
  const IconComponent = ICON_MAP[icon] ?? Folder;
  return <IconComponent className="w-3.5 h-3.5 shrink-0" style={color ? { color } : undefined} />;
}

interface KnowledgeGroupListProps {
  groups: KnowledgeGroup[];
  activeFilter: KnowledgeGroupFilter;
  onFilterChange: (filter: KnowledgeGroupFilter) => void;
  onCreateGroup: (name: string) => Promise<void>;
  onDeleteGroup: (id: number) => Promise<void>;
  onUpdateGroup: (id: number, name: string, icon?: string, color?: string) => Promise<void>;
  onNewKnowledge: () => void;
}

const COLOR_OPTIONS = [
  '',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

export function KnowledgeGroupList({
  groups,
  activeFilter,
  onFilterChange,
  onCreateGroup,
  onDeleteGroup,
  onUpdateGroup,
  onNewKnowledge,
}: KnowledgeGroupListProps) {
  const { t } = useTranslation();
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<{ id: number; x: number; y: number } | null>(null);
  const [editingGroup, setEditingGroup] = useState<KnowledgeGroup | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('folder');
  const [editColor, setEditColor] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreatingGroup && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreatingGroup]);

  useEffect(() => {
    if (editingGroup && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingGroup]);

  const startEditGroup = (group: KnowledgeGroup) => {
    setEditName(group.name);
    setEditIcon(group.icon ?? 'folder');
    setEditColor(group.color ?? '');
    setMenuAnchor(null);
    setEditingGroup(group);
  };

  const handleSaveEdit = async () => {
    if (!editingGroup) return;
    const name = editName.trim();
    if (name) {
      await onUpdateGroup(editingGroup.id, name, editIcon || undefined, editColor || undefined);
    }
    setEditingGroup(null);
  };

  // Close menu on outside click
  useEffect(() => {
    if (!menuAnchor) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuAnchor(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuAnchor]);

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) {
      setIsCreatingGroup(false);
      setNewGroupName('');
      return;
    }
    await onCreateGroup(name);
    setIsCreatingGroup(false);
    setNewGroupName('');
  };

  const isActive = (filter: KnowledgeGroupFilter) => {
    if (filter === activeFilter) return true;
    if (
      typeof filter === 'object' &&
      typeof activeFilter === 'object' &&
      filter.groupId === activeFilter.groupId
    )
      return true;
    return false;
  };

  return (
    <>
      <div className="flex flex-col h-full select-none">
        {/* New Knowledge button */}
        <div className="p-2 border-b border-border/40">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs font-medium text-primary hover:text-primary hover:bg-primary/10"
            onClick={onNewKnowledge}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {t('knowledge.newKnowledge')}
          </Button>
        </div>

        {/* Group list */}
        <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
          {/* All */}
          <button
            type="button"
            className={cn(
              'w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-colors text-left',
              isActive('all')
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
            onClick={() => onFilterChange('all')}
          >
            <FolderOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('knowledge.allKnowledge')}</span>
          </button>

          {/* Ungrouped */}
          <button
            type="button"
            className={cn(
              'w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-colors text-left',
              isActive('ungrouped')
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
            onClick={() => onFilterChange('ungrouped')}
          >
            <Folder className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('knowledge.ungrouped')}</span>
          </button>

          {/* Divider */}
          {groups.length > 0 && <div className="my-1 mx-3 border-t border-border/40" />}

          {/* Groups */}
          {groups.map((group) => (
            <div key={group.id} className="relative group/item">
              <button
                type="button"
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-colors text-left pr-8',
                  isActive({ groupId: group.id })
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
                onClick={() => onFilterChange({ groupId: group.id })}
              >
                <GroupIcon icon={group.icon} color={group.color} />
                <span className="truncate">{group.name}</span>
              </button>

              {/* Context menu trigger */}
              <button
                type="button"
                className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 p-1 rounded hover:bg-accent transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  if (menuAnchor?.id === group.id) {
                    setMenuAnchor(null);
                  } else {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenuAnchor({ id: group.id, x: rect.right + 4, y: rect.top });
                  }
                }}
              >
                <MoreHorizontal className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>

        {/* Footer: New Group + Archived */}
        <div className="border-t border-border/40 p-1">
          {/* Create group inline input */}
          {isCreatingGroup ? (
            <div className="flex items-center gap-1 px-2 py-1">
              <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateGroup();
                  if (e.key === 'Escape') {
                    setIsCreatingGroup(false);
                    setNewGroupName('');
                  }
                }}
                onBlur={handleCreateGroup}
                className="flex-1 bg-transparent text-xs outline-none border-b border-primary text-foreground placeholder-muted-foreground"
                placeholder={t('knowledge.groupNamePlaceholder')}
              />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleCreateGroup}
                className="p-0.5 hover:text-foreground text-muted-foreground"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setIsCreatingGroup(false);
                  setNewGroupName('');
                }}
                className="p-0.5 hover:text-foreground text-muted-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors text-left"
              onClick={() => setIsCreatingGroup(true)}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              {t('knowledge.newGroup')}
            </button>
          )}

          {/* Archived */}
          <button
            type="button"
            className={cn(
              'w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-colors text-left',
              isActive('archived')
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
            onClick={() => onFilterChange('archived')}
          >
            <Archive className="w-3.5 h-3.5 shrink-0" />
            {t('knowledge.archived')}
          </button>
        </div>
      </div>

      {/* Context dropdown menu — rendered at fixed position to escape overflow clipping */}
      {menuAnchor &&
        (() => {
          const activeGroup = groups.find((g) => g.id === menuAnchor.id);
          if (!activeGroup) return null;
          return (
            <div
              ref={menuRef}
              style={{ position: 'fixed', left: menuAnchor.x, top: menuAnchor.y }}
              className="z-[9999] bg-popover border border-border rounded-md shadow-md py-1 w-36"
            >
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-foreground"
                onClick={() => startEditGroup(activeGroup)}
              >
                <Pencil className="w-3 h-3" />
                <span>{t('knowledge.editGroup')}</span>
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-foreground"
                onClick={() => {
                  setMenuAnchor(null);
                  onDeleteGroup(activeGroup.id);
                }}
              >
                <Trash2 className="w-3 h-3 text-destructive" />
                <span className="text-destructive">{t('knowledge.deleteGroup')}</span>
              </button>
            </div>
          );
        })()}

      {/* Edit Group Modal */}
      {editingGroup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setEditingGroup(null)}
        >
          <div
            className="bg-popover border border-border rounded-lg shadow-xl p-4 w-64"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-semibold text-foreground mb-3">{t('knowledge.editGroup')}</p>

            {/* Name */}
            <input
              ref={editInputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit();
                if (e.key === 'Escape') setEditingGroup(null);
              }}
              className="w-full bg-transparent border border-border rounded px-2 py-1 text-xs text-foreground outline-none focus:border-primary mb-3"
              placeholder={t('knowledge.groupNamePlaceholder')}
            />

            {/* Icon selector */}
            <p className="text-[10px] text-muted-foreground mb-1">{t('knowledge.groupIcon')}</p>
            <div className="flex flex-wrap gap-1 mb-3">
              {Object.entries(ICON_MAP).map(([key, IconComp]) => (
                <button
                  key={key}
                  type="button"
                  title={key}
                  className={cn(
                    'p-1.5 rounded border transition-colors',
                    editIcon === key
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  )}
                  onClick={() => setEditIcon(key)}
                >
                  <IconComp className="w-3 h-3" />
                </button>
              ))}
            </div>

            {/* Color selector */}
            <p className="text-[10px] text-muted-foreground mb-1">{t('knowledge.groupColor')}</p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color || 'none'}
                  type="button"
                  title={color || t('knowledge.colorDefault')}
                  className={cn(
                    'w-5 h-5 rounded-full border-2 transition-transform hover:scale-110',
                    editColor === color ? 'border-foreground scale-110' : 'border-transparent'
                  )}
                  style={{
                    backgroundColor: color || 'var(--muted-foreground)',
                    opacity: color ? 1 : 0.3,
                  }}
                  onClick={() => setEditColor(color)}
                />
              ))}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-1 text-xs rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                onClick={() => setEditingGroup(null)}
              >
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleSaveEdit}
              >
                {t('actions.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
