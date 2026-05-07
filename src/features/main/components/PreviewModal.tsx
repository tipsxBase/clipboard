/**
 * PreviewModal - React Component
 *
 * Modal for previewing clipboard items: text, HTML, files, images.
 */
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileText, Files, Image as ImageIcon, X, Code, ScanText, CornerDownLeft } from 'lucide-react';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LocalImage } from '@/components/LocalImage';
import { QuickActionMenu } from '@/components/QuickActionMenu';
import { useTimeAgo } from '@/hooks/useTimeAgo';
import type { ClipboardItem } from '@/types';

// File icon helper
function getFileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  if (!ext) return Files;
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'];
  const codeExts = ['js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'py', 'rs', 'java', 'c', 'cpp'];
  const docExts = ['doc', 'docx', 'pdf', 'txt', 'rtf', 'md'];
  if (imageExts.includes(ext)) return ImageIcon;
  if (codeExts.includes(ext)) return Code;
  if (docExts.includes(ext)) return FileText;
  return Files;
}

// Parse files list from JSON
function getFilesList(content: string): string[] {
  try {
    return JSON.parse(content);
  } catch {
    return [];
  }
}

export function PreviewModal({
  previewItem,
  previewContent,
  onClose,
  onPaste,
  onOcr,
  onActionDone,
}: {
  previewItem: ClipboardItem | null;
  previewContent: string | null;
  onClose: () => void;
  onPaste: (item: ClipboardItem) => void;
  onOcr?: (item: ClipboardItem) => void;
  onActionDone?: () => void;
}) {
  const { t } = useTranslation();
  const { formatTimeAgo } = useTimeAgo();

  const [showHtml, setShowHtml] = useState(false);
  const [linkedScreenshot, setLinkedScreenshot] = useState<ClipboardItem | null>(null);

  useEffect(() => {
    if (previewItem?.screenshot_id) {
      invoke<ClipboardItem | null>('get_item_by_id', { id: previewItem.screenshot_id })
        .then((item) => setLinkedScreenshot(item ?? null))
        .catch(() => setLinkedScreenshot(null));
    } else {
      setLinkedScreenshot(null);
    }
    setShowHtml(!!previewItem?.html_content);
  }, [previewItem]);

  if (!previewItem) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl shadow-2xl border border-border max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            {previewItem.kind === 'text' && <FileText className="w-4 h-4" />}
            {previewItem.kind === 'file' && <Files className="w-4 h-4" />}
            {previewItem.kind === 'image' && <ImageIcon className="w-4 h-4" />}
            <span className="text-sm font-medium">{formatTimeAgo(previewItem.timestamp)}</span>
          </div>
          <Button onClick={onClose} size="icon" variant="ghost" className="h-8 w-8">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-auto bg-card px-6 py-6">
          {previewItem.kind === 'text' && (
            <div className="flex flex-col gap-2">
              {previewItem.html_content && (
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={() => setShowHtml(!showHtml)}>
                    {showHtml ? <FileText className="w-3 h-3" /> : <Code className="w-3 h-3" />}
                    {showHtml ? 'Text' : 'HTML'}
                  </Button>
                </div>
              )}
              {showHtml && previewItem.html_content ? (
                <div
                  className="rounded-md border border-input bg-background shadow-sm overflow-auto text-sm leading-relaxed p-4 min-w-full w-fit"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewItem.html_content, { ADD_ATTR: ['style'] }) }}
                />
              ) : (
                <pre className="font-mono text-sm text-foreground whitespace-pre-wrap break-all">
                  {previewContent || previewItem.content}
                </pre>
              )}
              {linkedScreenshot && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />
                    {t('preview.sourceScreenshot')}
                  </p>
                  <LocalImage src={linkedScreenshot.content} className="max-w-full max-h-40 rounded-md shadow-sm cursor-pointer hover:opacity-80 transition-opacity" onClick={() => onClose()} />
                </div>
              )}
            </div>
          )}
          {previewItem.kind === 'file' && (
            <div className="flex flex-col gap-2">
              <h3 className="font-medium text-sm text-muted-foreground">{getFilesList(previewItem.content).length} Files</h3>
              <div className="space-y-1">
                {getFilesList(previewItem.content).map((file, i) => {
                  const Icon = getFileIcon(file);
                  return (
                    <div key={i} className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm break-all font-mono">
                      <Icon className="shrink-0 w-5 h-5 text-muted-foreground" />
                      {file}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {previewItem.kind === 'image' && (
            <div className="flex justify-center">
              <LocalImage src={previewItem.content} className="max-w-full rounded-lg shadow-lg" />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 border-t border-border bg-card px-3 py-3">
          {onActionDone && <QuickActionMenu item={previewItem} onActionDone={onActionDone} />}
          {previewItem.kind === 'image' && onOcr && (
            <Button onClick={() => onOcr(previewItem)} variant="secondary" className="gap-2">
              <ScanText className="w-4 h-4" /> {t('actions.ocr')}
            </Button>
          )}
          <Button onClick={() => { onPaste(previewItem); onClose(); }} className="gap-2">
            <CornerDownLeft className="w-4 h-4" /> {t('actions.paste')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PreviewModal;