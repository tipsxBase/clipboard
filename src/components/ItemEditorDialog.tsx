/**
 * ItemEditorDialog Component - React version
 *
 * Dialog for editing clipboard items or adding new items.
 */
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { ClipboardItem } from '@/types';

export interface ItemEditorDialogProps {
  open: boolean;
  item?: ClipboardItem | null;
  noteOnly?: boolean;
  onSave: (data: {
    content: string;
    dataType: string;
    note?: string;
    id?: number;
    html_content?: string;
  }) => void;
  onClose: () => void;
}

export function ItemEditorDialog({
  open,
  item,
  noteOnly = false,
  onSave,
  onClose,
}: ItemEditorDialogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'add' | 'edit'>('add');
  const [content, setContent] = useState('');
  const [note, setNote] = useState('');
  const [selectedType, setSelectedType] = useState('text');
  const [isRichTextMode, setIsRichTextMode] = useState(false);
  const richTextEditorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      if (item) {
        setMode('edit');
        setContent(item.content);
        setNote(item.note || '');
        setSelectedType(item.data_type || 'text');

        if (item.html_content) {
          setIsRichTextMode(true);
          // Wait for DOM to render
          setTimeout(() => {
            if (richTextEditorRef.current) {
              richTextEditorRef.current.innerHTML = item.html_content!;
            }
          }, 0);
        } else {
          setIsRichTextMode(false);
        }
      } else {
        setMode('add');
        setContent('');
        setNote('');
        setSelectedType('text');
        setIsRichTextMode(false);
      }
    }
  }, [open, item]);

  const handleRichTextInput = (e: React.FormEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setContent(target.innerText);
  };

  const handleSave = () => {
    let finalContent = content;
    let finalHtml: string | undefined = undefined;

    if (noteOnly) {
      if (item) {
        finalContent = item.content;
        finalHtml = item.html_content;
      }
    } else if (isRichTextMode && richTextEditorRef.current) {
      finalHtml = richTextEditorRef.current.innerHTML;
      finalContent = richTextEditorRef.current.innerText;
    }

    if (!noteOnly && !finalContent.trim()) return;

    onSave({
      content: finalContent,
      dataType: selectedType,
      note: note,
      id: item?.id,
      html_content: finalHtml,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={`flex flex-col bg-card text-card-foreground ${
          noteOnly ? 'h-auto w-[80vw] max-w-[400px]' : 'h-[80vh] w-[80vw] max-w-[800px]'
        }`}
      >
        <DialogHeader>
          <DialogTitle>
            {noteOnly
              ? t('actions.editNote')
              : mode === 'edit'
                ? t('actions.edit')
                : t('actions.addItem')}
          </DialogTitle>
        </DialogHeader>

        <div
          className={`flex flex-col gap-4 flex-1 overflow-hidden py-4 min-h-0 ${
            noteOnly ? 'justify-center' : ''
          }`}
        >
          {/* Type Selector */}
          {!noteOnly && (
            <div className="flex items-center gap-2">
              <Label>{t('editor.type')}</Label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">{t('filters.text')}</SelectItem>
                  <SelectItem value="url">{t('filters.url')}</SelectItem>
                  <SelectItem value="code">{t('filters.code')}</SelectItem>
                  <SelectItem value="email">{t('filters.email')}</SelectItem>
                  <SelectItem value="phone">{t('filters.phone')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Note Input */}
          <div className="flex flex-col gap-2 flex-grow-0">
            <Label>{t('editor.note')}</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('editor.notePlaceholder')}
            />
          </div>

          {/* Content Editor */}
          {!noteOnly && (
            <div className="flex-1 flex flex-col gap-2 min-h-0">
              <Label>{t('editor.content')}</Label>
              {/* Rich Text Editor */}
              {isRichTextMode ? (
                <div
                  ref={richTextEditorRef}
                  contentEditable
                  className="flex-1 w-full p-4 rounded-md border border-input bg-background shadow-sm overflow-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-sm leading-relaxed"
                  onInput={handleRichTextInput}
                />
              ) : (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="flex-1 w-full p-4 rounded-md border border-input bg-background shadow-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono text-sm leading-relaxed"
                  placeholder={t('editor.placeholder')}
                />
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('settings.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!noteOnly && !content.trim()}>
            {t('settings.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ItemEditorDialog;
