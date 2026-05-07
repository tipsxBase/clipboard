/**
 * CollectionsManagerDialog - React Component
 *
 * Dialog for managing collections: create, edit, delete, navigate.
 */
import { useState, useCallback } from 'react';
import {
  Folder,
  Plus,
  Edit2,
  X,
  Star,
  Heart,
  Bookmark,
  Tag,
  Box,
  Briefcase,
  Home,
  Palette,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Collection } from '@/types';

// Collection icons
const COLLECTION_ICONS = [
  { name: 'folder', icon: Folder },
  { name: 'star', icon: Star },
  { name: 'heart', icon: Heart },
  { name: 'bookmark', icon: Bookmark },
  { name: 'tag', icon: Tag },
  { name: 'box', icon: Box },
  { name: 'briefcase', icon: Briefcase },
  { name: 'home', icon: Home },
];

// Collection colors
const COLLECTION_COLORS = [
  '#ef4444',
  '#f97316',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#6366f1',
];

export function CollectionsManagerDialog({
  open,
  onOpenChange,
  collections,
  totalCollectedCount,
  onOpenCollectionView,
  onRefresh,
  onCreateCollection,
  onDeleteCollection,
  onUpdateCollection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: Collection[];
  totalCollectedCount: number;
  onOpenCollectionView: (id: number) => void;
  onRefresh: () => void;
  onCreateCollection: (name: string) => Promise<Collection | null>;
  onDeleteCollection: (id: number) => Promise<void>;
  onUpdateCollection: (id: number, name: string, icon?: string, color?: string) => Promise<void>;
}) {
  const { t } = useTranslation();

  const [newCollectionName, setNewCollectionName] = useState('');
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingIcon, setEditingIcon] = useState('folder');
  const [editingColor, setEditingColor] = useState('');
  const [showEditor, setShowEditor] = useState(false);

  // Create collection
  const handleCreateCollection = useCallback(async () => {
    if (!newCollectionName.trim()) return;
    await onCreateCollection(newCollectionName.trim());
    setNewCollectionName('');
    onRefresh();
  }, [newCollectionName, onCreateCollection, onRefresh]);

  // Open editor
  const openEditor = useCallback((collection: Collection) => {
    setEditingCollection(collection);
    setEditingName(collection.name);
    setEditingIcon(collection.icon || 'folder');
    setEditingColor(collection.color || '');
    setShowEditor(true);
  }, []);

  // Save collection
  const handleSaveCollection = useCallback(async () => {
    if (!editingCollection?.id || !editingName.trim()) return;
    await onUpdateCollection(editingCollection.id, editingName.trim(), editingIcon, editingColor);
    setShowEditor(false);
    setEditingCollection(null);
    onRefresh();
  }, [editingCollection, editingName, editingIcon, editingColor, onUpdateCollection, onRefresh]);

  // Delete collection
  const handleDeleteCollection = useCallback(async (collection: Collection) => {
    if (!collection.id) return;
    await onDeleteCollection(collection.id);
    onRefresh();
  }, [onDeleteCollection, onRefresh]);

  // Get icon component
  const getIconComponent = (icon?: string) => {
    const found = COLLECTION_ICONS.find((i) => i.name === icon);
    return found?.icon || Folder;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-primary" />
            {t('collections.managerTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('collections.allCollections')} · {totalCollectedCount} {t('stats.items')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Create new collection */}
          <div className="flex gap-2">
            <Input
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              className="flex-1 h-9 rounded-lg border-border bg-background text-sm shadow-none"
              placeholder={t('collections.newPlaceholder')}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCollection(); }}
            />
            <Button onClick={handleCreateCollection} className="shrink-0">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Collection list */}
          <div className="max-h-[320px] space-y-1 overflow-y-auto custom-scrollbar">
            {collections.map((collection) => {
              const Icon = getIconComponent(collection.icon);
              return (
                <div key={collection.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => { if (collection.id) { onOpenCollectionView(collection.id); onOpenChange(false); } }}
                  >
                    <Icon className="h-4 w-4 shrink-0" style={{ color: collection.color || 'currentColor' }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{collection.name}</div>
                      <div className="text-[11px] text-muted-foreground">{collection.item_count || 0} {t('stats.items')}</div>
                    </div>
                  </button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={(e) => { e.stopPropagation(); openEditor(collection); }}>
                    <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={(e) => { e.stopPropagation(); handleDeleteCollection(collection); }}>
                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>

      {/* Collection Editor Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Folder className="w-5 h-5 text-primary" />
              {t('collections.editCollection')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('collections.rename')}</Label>
              <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="h-8" />
            </div>

            {/* Icon */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('collections.selectIcon')}</Label>
              <div className="flex gap-2">
                {COLLECTION_ICONS.map((iconOpt) => (
                  <Button key={iconOpt.name} onClick={() => setEditingIcon(iconOpt.name)} variant="outline" size="icon" className={`h-8 w-8 ${editingIcon === iconOpt.name ? 'bg-primary text-primary-foreground' : ''}`}>
                    <iconOpt.icon className="w-4 h-4" />
                  </Button>
                ))}
              </div>
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('collections.selectColor')}</Label>
              <div className="flex gap-2">
                {COLLECTION_COLORS.map((colorOpt) => (
                  <Button key={colorOpt} onClick={() => setEditingColor(colorOpt)} variant="outline" size="icon" className={`h-8 w-8 ${editingColor === colorOpt ? 'ring-2 ring-primary' : ''}`}>
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: colorOpt }} />
                  </Button>
                ))}
                <Button onClick={() => setEditingColor('')} variant="outline" size="icon" className={`h-8 w-8 ${editingColor === '' ? 'ring-2 ring-primary' : ''}`}>
                  <Palette className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowEditor(false)}>{t('settings.cancel')}</Button>
            <Button onClick={handleSaveCollection} disabled={!editingName.trim()}>{t('settings.save')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

export default CollectionsManagerDialog;