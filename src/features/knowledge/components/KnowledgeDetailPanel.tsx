import { useState, useEffect, useRef, useCallback } from 'react';
import { Save, Archive, Trash2, RotateCcw, AlertTriangle, ChevronDown, Code2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useTimeAgo } from '@/hooks/useTimeAgo';
import type { KnowledgeItem, KnowledgeGroup } from '@/types';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';

// Inner component: each item gets its own editor instance via key={item.id},
// so there is never a race condition between async markdown parsing and replaceBlocks.
function KnowledgeBlockEditor({
  initialContent,
  editable,
  onContentChange,
}: {
  initialContent: string;
  editable: boolean;
  onContentChange: (markdown: string) => void;
}) {
  const editor = useCreateBlockNote();

  useEffect(() => {
    const blocks = editor.tryParseMarkdownToBlocks(initialContent);
    editor.replaceBlocks(editor.document, blocks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme="light"
      onChange={async () => {
        const markdown = await editor.blocksToMarkdownLossy(editor.document);
        onContentChange(markdown);
      }}
    />
  );
}

// CodeMirror raw markdown editor
function CodeMirrorEditor({
  value,
  editable,
  onChange,
}: {
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          markdown(),
          oneDark,
          EditorView.editable.of(editable),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChange(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  // Sync external value changes (e.g. switching item)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div ref={containerRef} className="text-xs [&_.cm-editor]:rounded [&_.cm-editor]:min-h-48" />
  );
}

interface KnowledgeDetailPanelProps {
  item: KnowledgeItem | null;
  groups: KnowledgeGroup[];
  onSave: (params: {
    id: number;
    title: string;
    summary?: string;
    content?: string;
    knowledge_group_id?: number;
  }) => Promise<void>;
  onArchive: (id: number) => Promise<void>;
  onRestore: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onNewItem: () => void;
}

export function KnowledgeDetailPanel({
  item,
  groups,
  onSave,
  onArchive,
  onRestore,
  onDelete,
  onNewItem,
}: KnowledgeDetailPanelProps) {
  const { t } = useTranslation();
  const { formatTimeAgo } = useTimeAgo();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [groupId, setGroupId] = useState<number | undefined>(undefined);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [editorMode, setEditorMode] = useState<'rich' | 'raw'>('rich');
  const groupDropdownRef = useRef<HTMLDivElement>(null);

  const isArchived = item?.status === 'archived';

  // Sync state when item changes
  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setSummary(item.summary ?? '');
      setContent(item.content ?? '');
      setGroupId(item.knowledge_group_id);
      setIsDirty(false);
    } else {
      setTitle('');
      setSummary('');
      setContent('');
      setGroupId(undefined);
      setIsDirty(false);
    }
    setShowDeleteConfirm(false);
    setShowArchiveConfirm(false);
  }, [item?.id]);

  // Close group dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(e.target as Node)) {
        setShowGroupDropdown(false);
      }
    };
    if (showGroupDropdown) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showGroupDropdown]);

  const markDirty = () => setIsDirty(true);

  const handleSave = useCallback(async () => {
    if (!item) return;
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      await onSave({
        id: item.id,
        title: title.trim(),
        summary: summary.trim(),
        content,
        knowledge_group_id: groupId,
      });
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  }, [item, title, summary, content, groupId, onSave]);

  // Cmd+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty && !isArchived) {
          handleSave();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, isArchived, handleSave]);

  const handleArchive = async () => {
    if (!item) return;
    await onArchive(item.id);
    setShowArchiveConfirm(false);
  };

  const handleRestore = async () => {
    if (!item) return;
    await onRestore(item.id);
  };

  const handleDelete = async () => {
    if (!item) return;
    await onDelete(item.id);
    setShowDeleteConfirm(false);
  };

  const selectedGroupName = groupId
    ? (groups.find((g) => g.id === groupId)?.name ?? t('knowledge.noGroup'))
    : t('knowledge.noGroup');

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="text-4xl mb-4 opacity-30">📚</div>
        <p className="text-sm text-muted-foreground">{t('knowledge.noItemSelected')}</p>
        <Button size="sm" variant="outline" className="mt-4 text-xs" onClick={onNewItem}>
          {t('knowledge.newKnowledge')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Archived banner */}
      {isArchived && (
        <div className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 shrink-0">
          <Archive className="w-3.5 h-3.5 shrink-0" />
          {t('knowledge.archivedView')}
        </div>
      )}

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="p-4 space-y-3">
          {/* Title */}
          <div>
            <input
              type="text"
              value={title}
              disabled={isArchived}
              onChange={(e) => {
                setTitle(e.target.value);
                markDirty();
              }}
              className={cn(
                'w-full text-sm font-semibold bg-transparent outline-none border-b pb-1 transition-colors',
                isArchived
                  ? 'text-muted-foreground cursor-default border-transparent'
                  : 'text-foreground border-border/40 focus:border-primary'
              )}
              placeholder={t('knowledge.titlePlaceholder')}
            />
          </div>

          {/* Group selector */}
          <div className="relative" ref={groupDropdownRef}>
            <button
              type="button"
              disabled={isArchived}
              className={cn(
                'flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-colors',
                isArchived
                  ? 'text-muted-foreground border-transparent cursor-default'
                  : 'text-foreground border-border/40 hover:border-primary hover:bg-accent/50'
              )}
              onClick={() => !isArchived && setShowGroupDropdown(!showGroupDropdown)}
            >
              <span className="text-muted-foreground">{t('knowledge.groupLabel')}:</span>
              <span>{selectedGroupName}</span>
              {!isArchived && <ChevronDown className="w-3 h-3 text-muted-foreground" />}
            </button>

            {showGroupDropdown && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-md shadow-md py-1 min-w-40 max-h-48 overflow-y-auto">
                <button
                  type="button"
                  className="w-full flex items-center px-3 py-1.5 text-xs hover:bg-accent text-foreground"
                  onClick={() => {
                    setGroupId(undefined);
                    setShowGroupDropdown(false);
                    markDirty();
                  }}
                >
                  {t('knowledge.noGroup')}
                </button>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="w-full flex items-center px-3 py-1.5 text-xs hover:bg-accent text-foreground"
                    onClick={() => {
                      setGroupId(g.id);
                      setShowGroupDropdown(false);
                      markDirty();
                    }}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">
              {t('knowledge.summaryLabel')}
            </label>
            <textarea
              value={summary}
              disabled={isArchived}
              onChange={(e) => {
                setSummary(e.target.value);
                markDirty();
              }}
              rows={2}
              className={cn(
                'w-full text-xs bg-muted/40 border border-border/40 rounded-md px-2.5 py-2 outline-none resize-none transition-colors',
                isArchived
                  ? 'text-muted-foreground cursor-default'
                  : 'text-foreground focus:border-primary'
              )}
              placeholder={t('knowledge.summaryPlaceholder')}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-h-75 border border-border/40 rounded-md overflow-hidden bg-background">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/40 bg-muted/20">
              <label className="text-[11px] text-muted-foreground">
                {t('knowledge.contentLabel')}
              </label>
              <button
                type="button"
                title={
                  editorMode === 'rich' ? t('knowledge.switchToRaw') : t('knowledge.switchToRich')
                }
                className={cn(
                  'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors',
                  editorMode === 'raw'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
                onClick={() => setEditorMode(editorMode === 'rich' ? 'raw' : 'rich')}
              >
                <Code2 className="w-3 h-3" />
                <span>
                  {editorMode === 'raw' ? t('knowledge.modeRaw') : t('knowledge.modeRich')}
                </span>
              </button>
            </div>
            <div className="p-2">
              {editorMode === 'rich' ? (
                <KnowledgeBlockEditor
                  key={`${item.id}-rich`}
                  initialContent={item.content ?? ''}
                  editable={!isArchived}
                  onContentChange={(markdown) => {
                    setContent(markdown);
                    markDirty();
                  }}
                />
              ) : (
                <CodeMirrorEditor
                  key={`${item.id}-raw`}
                  value={content}
                  editable={!isArchived}
                  onChange={(val) => {
                    setContent(val);
                    markDirty();
                  }}
                />
              )}
            </div>
          </div>

          {/* Meta info */}
          <div className="text-[10px] text-muted-foreground/60 space-y-0.5">
            <div>
              {t('knowledge.sourceLabel')}:{' '}
              {item.source_kind === 'clipboard'
                ? t('knowledge.sourceClipboard')
                : t('knowledge.sourceManual')}
            </div>
            <div>{t('knowledge.createdAt', { time: formatTimeAgo(item.created_at) })}</div>
            <div>{t('knowledge.savedAt', { time: formatTimeAgo(item.updated_at) })}</div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="border-t border-border/40 p-3 shrink-0">
        {/* Confirm overlays */}
        {showDeleteConfirm && (
          <div className="flex items-center gap-2 mb-2 p-2 bg-destructive/10 rounded-md border border-destructive/20">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
            <span className="text-xs text-destructive flex-1">{t('knowledge.deleteConfirm')}</span>
            <button
              type="button"
              className="text-xs text-destructive font-medium hover:underline"
              onClick={handleDelete}
            >
              {t('knowledge.delete')}
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setShowDeleteConfirm(false)}
            >
              {t('rules.cancel')}
            </button>
          </div>
        )}
        {showArchiveConfirm && (
          <div className="flex items-center gap-2 mb-2 p-2 bg-amber-500/10 rounded-md border border-amber-500/20">
            <Archive className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-xs text-amber-600 dark:text-amber-400 flex-1">
              {t('knowledge.archiveConfirm')}
            </span>
            <button
              type="button"
              className="text-xs text-amber-600 dark:text-amber-400 font-medium hover:underline"
              onClick={handleArchive}
            >
              {t('knowledge.archive')}
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setShowArchiveConfirm(false)}
            >
              {t('rules.cancel')}
            </button>
          </div>
        )}

        {isArchived ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={handleRestore}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              {t('knowledge.restore')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {t('knowledge.permanentDelete')}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 text-xs"
              disabled={!isDirty || isSaving || !title.trim()}
              onClick={handleSave}
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {isSaving ? '...' : t('knowledge.save')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => setShowArchiveConfirm(true)}
            >
              <Archive className="w-3.5 h-3.5 mr-1.5" />
              {t('knowledge.archive')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
