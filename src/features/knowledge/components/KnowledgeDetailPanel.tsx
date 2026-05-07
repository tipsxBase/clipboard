/**
 * KnowledgeDetailPanel - Premium Immersive Editor Component
 *
 * Design: Craft + Notion AI + Obsidian inspired
 * Features: AI Summary Card, minimal toolbar, BlockNote editor, status bar
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Save,
  Archive,
  Trash2,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  Code2,
  Star,
  Sparkles,
  Share2,
  MoreHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useTimeAgo } from '@/hooks/useTimeAgo';
import type { KnowledgeItem, KnowledgeGroup } from '@/types';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';

// Inner component: BlockNote editor
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
    <div ref={containerRef} className="text-sm [&_.cm-editor]:rounded-lg [&_.cm-editor]:min-h-48" />
  );
}

// AI Summary Card Component
function AISummaryCard({
  summary,
  onRegenerate,
  onEdit,
}: {
  summary: string;
  onRegenerate?: () => void;
  onEdit?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="ai-card p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold text-primary">{t('knowledge.aiSummary')}</span>
        <div className="ai-shimmer flex-1 h-4 rounded" />
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed mb-3">{summary}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="ai-button px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1"
          onClick={onRegenerate}
        >
          <Sparkles className="w-3 h-3" />
          {t('knowledge.regenerate')}
        </button>
        <button
          type="button"
          className="px-2.5 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          onClick={onEdit}
        >
          {t('knowledge.edit')}
        </button>
      </div>
    </div>
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
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const groupDropdownRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const isArchived = item?.status === 'archived';
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

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

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(e.target as Node)) {
        setShowGroupDropdown(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    if (showGroupDropdown || showMoreMenu) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showGroupDropdown, showMoreMenu]);

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
      <div className="flex flex-col items-center justify-center h-full text-center px-8 bg-[var(--bg-base)]">
        <div className="w-16 h-16 rounded-2xl bg-muted/20 flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-muted-foreground mb-1">{t('knowledge.noItemSelected')}</p>
        <p className="text-xs text-muted-foreground/60 mb-4">{t('knowledge.selectOrCreate')}</p>
        <button
          type="button"
          className="ai-button px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          onClick={onNewItem}
        >
          <Sparkles className="w-4 h-4" />
          {t('knowledge.newKnowledge')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Archived banner */}
      {isArchived && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 shrink-0">
          <Archive className="w-3.5 h-3.5 shrink-0" />
          {t('knowledge.archivedView')}
        </div>
      )}

      {/* Header toolbar - Minimal */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 shrink-0">
        {/* Group selector */}
        <div className="relative" ref={groupDropdownRef}>
          <button
            type="button"
            disabled={isArchived}
            className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
              isArchived
                ? 'text-muted-foreground border-transparent cursor-default'
                : 'text-muted-foreground border-border/40 hover:border-primary hover:bg-accent/50'
            )}
            onClick={() => !isArchived && setShowGroupDropdown(!showGroupDropdown)}
          >
            <span>{selectedGroupName}</span>
            {!isArchived && <ChevronDown className="w-3 h-3" />}
          </button>

          {showGroupDropdown && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-40 max-h-48 overflow-y-auto">
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

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {/* Star/Favorite */}
          <button
            type="button"
            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-accent/50 transition-colors"
            title={t('knowledge.favorite')}
          >
            <Star className="w-4 h-4" />
          </button>

          {/* AI Action */}
          <button
            type="button"
            className="ai-button p-2 rounded-lg flex items-center gap-1"
            title={t('knowledge.aiAssistant')}
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Share */}
          <button
            type="button"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title={t('knowledge.share')}
          >
            <Share2 className="w-4 h-4" />
          </button>

          {/* More menu */}
          <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {showMoreMenu && (
              <div className="absolute top-full right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 w-36">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-foreground"
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowArchiveConfirm(true);
                  }}
                >
                  <Archive className="w-3 h-3" />
                  <span>{t('knowledge.archive')}</span>
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-destructive"
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowDeleteConfirm(true);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{t('knowledge.delete')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-6 bg-[var(--bg-base)]">
        {/* Title - Large, prominent */}
        <input
          type="text"
          value={title}
          disabled={isArchived}
          onChange={(e) => {
            setTitle(e.target.value);
            markDirty();
          }}
          className={cn(
            'w-full text-xl font-semibold bg-transparent outline-none pb-2 mb-4 transition-colors',
            isArchived
              ? 'text-muted-foreground cursor-default'
              : 'text-foreground border-b border-transparent focus:border-border/40'
          )}
          placeholder={t('knowledge.titlePlaceholder')}
        />

        {/* AI Summary Card */}
        {summary && <AISummaryCard summary={summary} />}

        {/* Summary input (if no AI summary) */}
        {!summary && (
          <div className="mb-4">
            <textarea
              value={summary}
              disabled={isArchived}
              onChange={(e) => {
                setSummary(e.target.value);
                markDirty();
              }}
              rows={2}
              className={cn(
                'w-full text-sm bg-muted/30 border border-border/30 rounded-lg px-3 py-2 outline-none resize-none transition-colors',
                isArchived
                  ? 'text-muted-foreground cursor-default'
                  : 'text-muted-foreground focus:border-primary focus:text-foreground'
              )}
              placeholder={t('knowledge.summaryPlaceholder')}
            />
          </div>
        )}

        {/* Editor mode toggle */}
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-muted-foreground">{t('knowledge.contentLabel')}</label>
          <button
            type="button"
            title={editorMode === 'rich' ? t('knowledge.switchToRaw') : t('knowledge.switchToRich')}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors',
              editorMode === 'raw'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
            onClick={() => setEditorMode(editorMode === 'rich' ? 'raw' : 'rich')}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>{editorMode === 'raw' ? t('knowledge.modeRaw') : t('knowledge.modeRich')}</span>
          </button>
        </div>

        {/* Editor */}
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-border/30 overflow-hidden">
          <div className="p-4 min-h-[300px]">
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
      </div>

      {/* Status bar */}
      <div className="status-bar shrink-0">
        <div className="flex items-center gap-2">
          {isDirty ? (
            <span className="text-primary">{t('knowledge.unsaved')}</span>
          ) : (
            <span>{t('knowledge.savedAt', { time: formatTimeAgo(item.updated_at) })}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span>{wordCount} {t('knowledge.words')}</span>
          <span>{t('knowledge.sourceLabel')}: {item.source_kind === 'clipboard' ? t('knowledge.sourceClipboard') : t('knowledge.sourceManual')}</span>
        </div>

        {/* Save button (if dirty) */}
        {isDirty && !isArchived && (
          <button
            type="button"
            className="ai-button px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ml-auto"
            disabled={isSaving || !title.trim()}
            onClick={handleSave}
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? '...' : t('knowledge.save')}
          </button>
        )}
      </div>

      {/* Confirm overlays */}
      {showDeleteConfirm && (
        <div className="absolute inset-x-0 bottom-0 p-4 bg-background/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 p-3 bg-destructive/10 rounded-xl border border-destructive/20">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <span className="text-sm text-destructive flex-1">{t('knowledge.deleteConfirm')}</span>
            <button
              type="button"
              className="text-sm text-destructive font-medium hover:underline px-2"
              onClick={handleDelete}
            >
              {t('knowledge.delete')}
            </button>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:underline px-2"
              onClick={() => setShowDeleteConfirm(false)}
            >
              {t('rules.cancel')}
            </button>
          </div>
        </div>
      )}

      {showArchiveConfirm && (
        <div className="absolute inset-x-0 bottom-0 p-4 bg-background/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
            <Archive className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-sm text-amber-600 flex-1">{t('knowledge.archiveConfirm')}</span>
            <button
              type="button"
              className="text-sm text-amber-600 font-medium hover:underline px-2"
              onClick={handleArchive}
            >
              {t('knowledge.archive')}
            </button>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:underline px-2"
              onClick={() => setShowArchiveConfirm(false)}
            >
              {t('rules.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Archived actions */}
      {isArchived && (
        <div className="status-bar">
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border hover:bg-accent/50 transition-colors"
            onClick={handleRestore}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('knowledge.restore')}
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-destructive border border-destructive/30 hover:bg-destructive/10 transition-colors ml-2"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('knowledge.permanentDelete')}
          </button>
        </div>
      )}
    </div>
  );
}

export default KnowledgeDetailPanel;