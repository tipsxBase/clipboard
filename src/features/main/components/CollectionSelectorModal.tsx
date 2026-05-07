/**
 * CollectionSelectorModal - React Component
 *
 * Modal for selecting a collection to assign an item to.
 */
import { Folder, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ClipboardItem, Collection } from '@/types';

export function CollectionSelectorModal({
  open,
  onOpenChange,
  item,
  collections,
  onSelect,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ClipboardItem | null;
  collections: Collection[];
  onSelect: (collectionId: number) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();

  if (!item) return null;

  const currentCollection = collections.find((c) => c.id === item.collection_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-primary" />
            {item.collection_id ? t('actions.moveToCollection') : t('actions.addToCollection')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-4">
          {/* Current collection */}
          {currentCollection && (
            <div className="flex items-center gap-2 p-2 rounded-lg border border-primary/20 bg-primary/5">
              <Folder className="w-4 h-4 text-primary" style={{ color: currentCollection.color || 'currentColor' }} />
              <span className="text-sm font-medium">{currentCollection.name}</span>
              <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={() => { onRemove(); onOpenChange(false); }}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}

          {/* Collection list */}
          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {collections.filter((c) => c.id !== item.collection_id).map((collection) => (
              <button
                key={collection.id}
                type="button"
                className="w-full flex items-center gap-2 p-2 rounded-lg border border-border bg-card hover:bg-accent transition-colors"
                onClick={() => { if (collection.id) { onSelect(collection.id); onOpenChange(false); } }}
              >
                <Folder className="w-4 h-4" style={{ color: collection.color || 'currentColor' }} />
                <span className="text-sm font-medium">{collection.name}</span>
              </button>
            ))}
          </div>

          {collections.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">{t('collections.noCollections')}</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CollectionSelectorModal;