/**
 * KnowledgeSidebar - Premium SaaS Sidebar Component
 *
 * Frosted glass, collapsible sidebar (56px ↔ 200px)
 * Design: Linear + Arc + Raycast inspired
 */
import { useState, useCallback } from 'react';
import {
  Library,
  Star,
  Archive,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Folder,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  X,
  Heart,
  Bookmark,
  Tag,
  Briefcase,
  Home,
  Code,
  Book,
  Lightbulb,
  Pin,
  Flag,
  Box,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
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
  return <IconComponent className="w-4 h-4 shrink-0" style={color ? { color } : undefined} />;
}

interface KnowledgeSidebarProps {
  groups: KnowledgeGroup[];
  activeFilter: KnowledgeGroupFilter;
  onFilterChange: (filter: KnowledgeGroupFilter) => void;
  onCreateGroup: (name: string) => Promise<void>;
  onDeleteGroup: (id: number) => Promise<void>;
  onUpdateGroup: (id: number, name: string, icon?: string, color?: string) => Promise<void>;
  onNewKnowledge: () => void;
  /** When true: full-width, always expanded, auto height (for use inside left panel) */
  integrated?: boolean;
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

export function KnowledgeSidebar({
  groups,
  activeFilter,
  onFilterChange,
  onCreateGroup,
  onDeleteGroup,
  onUpdateGroup,
  onNewKnowledge,
  integrated = false,
}: KnowledgeSidebarProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  // In integrated mode always expand; override any local toggle
  const effectiveExpanded = integrated ? true : expanded;
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<{ id: number; x: number; y: number } | null>(null);
  const [editingGroup, setEditingGroup] = useState<KnowledgeGroup | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('folder');
  const [editColor, setEditColor] = useState('');

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

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

  const sidebarWidth = integrated ? 'w-full' : effectiveExpanded ? 'w-[200px]' : 'w-[56px]';

  return (
    <>
      <div
        className={cn(
          'glass-sidebar sidebar-collapse flex flex-col select-none overflow-hidden',
          integrated ? '' : 'h-full',
          sidebarWidth
        )}
      >
        {/* Top: Logo + Toggle (hidden in integrated mode) */}
        {!integrated && (
          <div className="flex items-center justify-between px-3 h-10 border-b border-border/30">
            {effectiveExpanded && (
              <span className="text-xs font-semibold tracking-wide text-muted-foreground">
                Clipboard
              </span>
            )}
            <button
              type="button"
              onClick={toggleExpanded}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              title={
                effectiveExpanded ? t('knowledge.collapseSidebar') : t('knowledge.expandSidebar')
              }
            >
              {effectiveExpanded ? (
                <ChevronLeft className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}

        {/* New Knowledge Button — hidden in integrated mode (topbar already has it) */}
        {!integrated && (
          <div className="px-2 py-2 border-b border-border/30">
            <button
              type="button"
              onClick={onNewKnowledge}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium transition-colors',
                'text-primary hover:bg-primary/10',
                effectiveExpanded ? 'justify-start' : 'justify-center'
              )}
            >
              <Plus className="w-4 h-4 shrink-0" />
              {effectiveExpanded && <span>{t('knowledge.newKnowledge')}</span>}
            </button>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {/* All */}
          <button
            type="button"
            className={cn(
              'sidebar-item',
              isActive('all') && 'sidebar-item-active',
              effectiveExpanded ? 'justify-start' : 'justify-center'
            )}
            onClick={() => onFilterChange('all')}
            title={!effectiveExpanded ? t('knowledge.allKnowledge') : undefined}
          >
            <Library className="w-4 h-4 shrink-0" />
            {effectiveExpanded && (
              <span className="text-xs font-medium">{t('knowledge.allKnowledge')}</span>
            )}
          </button>

          {/* Ungrouped */}
          <button
            type="button"
            className={cn(
              'sidebar-item',
              isActive('ungrouped') && 'sidebar-item-active',
              effectiveExpanded ? 'justify-start' : 'justify-center'
            )}
            onClick={() => onFilterChange('ungrouped')}
            title={!effectiveExpanded ? t('knowledge.ungrouped') : undefined}
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            {effectiveExpanded && <span className="text-xs">{t('knowledge.ungrouped')}</span>}
          </button>

          {/* Divider */}
          {groups.length > 0 && <div className="my-2 mx-2 border-t border-border/30" />}

          {/* Groups */}
          {groups.length > 0 && (
            <div className="space-y-0.5">
              {groups.map((group) => (
                <div key={group.id} className="relative group/item">
                  <button
                    type="button"
                    className={cn(
                      'sidebar-item',
                      isActive({ groupId: group.id }) && 'sidebar-item-active',
                      effectiveExpanded ? 'justify-start' : 'justify-center'
                    )}
                    onClick={() => onFilterChange({ groupId: group.id })}
                    title={!effectiveExpanded ? group.name : undefined}
                  >
                    <GroupIcon icon={group.icon} color={group.color} />
                    {effectiveExpanded && <span className="text-xs truncate">{group.name}</span>}
                  </button>

                  {/* Context menu trigger */}
                  {effectiveExpanded && (
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
                  )}
                </div>
              ))}
            </div>
          )}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-border/30 py-2 px-2 space-y-0.5">
          {/* Create group inline — hidden in integrated mode (topbar already has it) */}
          {effectiveExpanded && !integrated && (
            <>
              {isCreatingGroup ? (
                <div className="flex items-center gap-2 px-2 py-1.5 sidebar-item">
                  <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
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
                    autoFocus
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleCreateGroup}
                    className="p-1 hover:text-foreground text-muted-foreground"
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
                    className="p-1 hover:text-foreground text-muted-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="sidebar-item hover:text-foreground"
                  onClick={() => setIsCreatingGroup(true)}
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  {effectiveExpanded && <span className="text-xs">{t('knowledge.newGroup')}</span>}
                </button>
              )}
            </>
          )}

          {/* Archived */}
          <button
            type="button"
            className={cn(
              'sidebar-item',
              isActive('archived') && 'sidebar-item-active',
              effectiveExpanded ? 'justify-start' : 'justify-center'
            )}
            onClick={() => onFilterChange('archived')}
            title={!effectiveExpanded ? t('knowledge.archived') : undefined}
          >
            <Archive className="w-4 h-4 shrink-0" />
            {effectiveExpanded && <span className="text-xs">{t('knowledge.archived')}</span>}
          </button>
        </div>
      </div>

      {/* Context dropdown menu */}
      {menuAnchor &&
        (() => {
          const activeGroup = groups.find((g) => g.id === menuAnchor.id);
          if (!activeGroup) return null;
          return (
            <div
              className="z-[9999] bg-popover border border-border rounded-lg shadow-lg py-1 w-36"
              style={{ position: 'fixed', left: menuAnchor.x, top: menuAnchor.y }}
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
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-destructive"
                onClick={() => {
                  setMenuAnchor(null);
                  onDeleteGroup(activeGroup.id);
                }}
              >
                <Trash2 className="w-3 h-3" />
                <span>{t('knowledge.deleteGroup')}</span>
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
            className="bg-popover border border-border rounded-xl shadow-xl p-4 w-64"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-semibold text-foreground mb-3">{t('knowledge.editGroup')}</p>

            {/* Name */}
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit();
                if (e.key === 'Escape') setEditingGroup(null);
              }}
              className="w-full bg-transparent border border-border rounded-lg px-2.5 py-2 text-xs text-foreground outline-none focus:border-primary mb-3"
              placeholder={t('knowledge.groupNamePlaceholder')}
              autoFocus
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
                className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                onClick={() => setEditingGroup(null)}
              >
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
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

export default KnowledgeSidebar;
