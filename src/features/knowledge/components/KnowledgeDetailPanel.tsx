/**
 * KnowledgeDetailPanel
 * Layout reference: image.png
 */
import { useState, useEffect, useRef, useCallback } from 'react';

// Selectors for elements that already handle their own click/focus —
// clicking inside these should not trigger the container focus proxy.
const EDITOR_CLICK_IGNORE_SELECTOR = [
  '[contenteditable="true"]',
  '.bn-formatting-toolbar',
  '.bn-link-toolbar',
  '.bn-side-menu',
  '.bn-form-popover',
  '[role="menu"]',
  '[role="dialog"]',
].join(', ');

function shouldIgnoreEditorContainerClick(target: HTMLElement): boolean {
  return Boolean(target.closest(EDITOR_CLICK_IGNORE_SELECTOR));
}

// Find the last block whose content is an array (i.e. supports text cursor).
function findLastTextBlock(
  blocks: Array<{ id: string; content?: unknown }>
): { id: string } | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (Array.isArray(block.content)) return block;
  }
  return null;
}
import {
  Save,
  Archive,
  Trash2,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  Code2,
  Sparkles,
  Link2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useTimeAgo } from '@/hooks/useTimeAgo';
import type { KnowledgeBacklink, KnowledgeItem, KnowledgeGroup } from '@/types';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { encodeWikilinks, decodeWikilinks } from '../lib/wikilinkUtils';
import { useDarkMode } from '@/hooks/useDarkMode';

// Inner component: BlockNote editor
function KnowledgeBlockEditor({
  initialContent,
  editable,
  onContentChange,
  pendingContentRef,
}: {
  initialContent: string;
  editable: boolean;
  onContentChange: (markdown: string) => void;
  pendingContentRef?: React.MutableRefObject<string | null>;
}) {
  const isDark = useDarkMode();
  // Use default BlockNote configuration (includes built-in code block support)
  const editor = useCreateBlockNote();

  useEffect(() => {
    // If there is pending content from a raw→rich mode switch, apply it first
    const pending = pendingContentRef?.current ?? null;
    const source = pending !== null ? pending : initialContent;
    if (pendingContentRef) pendingContentRef.current = null;

    const encoded = encodeWikilinks(source);
    const blocks = editor.tryParseMarkdownToBlocks(encoded);
    editor.replaceBlocks(editor.document, blocks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!editable) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!target || shouldIgnoreEditorContainerClick(target)) return;

      const blocks = editor.document as Array<{ id: string; content?: unknown }>;
      const targetBlock = findLastTextBlock(blocks);
      if (targetBlock) {
        try {
          editor.setTextCursorPosition(targetBlock.id, 'end');
        } catch {
          // Ignore transient selection errors; fall back to plain focus.
        }
      }
      editor.focus();
    },
    [editor, editable]
  );

  return (
    <div className="h-full" onClick={handleContainerClick}>
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={isDark ? 'dark' : 'light'}
        onChange={async () => {
          const raw = await editor.blocksToMarkdownLossy(editor.document);
          onContentChange(decodeWikilinks(raw));
        }}
        className="h-full"
      />
    </div>
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
  const isDark = useDarkMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef(new Compartment());

  useEffect(() => {
    if (!containerRef.current) return;
    const themeCompartment = themeCompartmentRef.current;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          markdown(),
          themeCompartment.of(isDark ? oneDark : []),
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

  // Dynamically swap CodeMirror colour theme when dark mode changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(isDark ? oneDark : []),
    });
  }, [isDark]);

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
    <div
      ref={containerRef}
      className="h-full text-sm [&_.cm-editor]:h-full [&_.cm-editor]:rounded-lg [&_.cm-scroller]:h-full"
    />
  );
}

interface KnowledgeDetailPanelProps {
  item: KnowledgeItem | null;
  groups: KnowledgeGroup[];
  backlinks?: KnowledgeBacklink[];
  allTags?: string[];
  onSave: (params: {
    id: number;
    title: string;
    summary?: string;
    content?: string;
    knowledge_group_id?: number;
    tags?: string[];
  }) => Promise<void>;
  onArchive: (id: number) => Promise<void>;
  onRestore: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onNewItem: () => void;
  onNavigateToItem?: (id: number) => void;
}

export function KnowledgeDetailPanel({
  item,
  groups,
  backlinks = [],
  allTags = [],
  onSave,
  onArchive,
  onRestore,
  onDelete,
  onNewItem,
  onNavigateToItem,
}: KnowledgeDetailPanelProps) {
  const { t } = useTranslation();
  const { formatTimeAgo } = useTimeAgo();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [groupId, setGroupId] = useState<number | undefined>(undefined);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [editorMode, setEditorMode] = useState<'rich' | 'raw'>('rich');
  const [showBacklinks, setShowBacklinks] = useState(false);
  const groupDropdownRef = useRef<HTMLDivElement>(null);
  // Stores content captured from raw-mode when switching back to rich-mode
  const pendingRawExitContentRef = useRef<string | null>(null);

  const isArchived = item?.status === 'archived';
  // Use word_count from backend (updated on save); fallback to local estimate
  const wordCount = item?.word_count ?? content.trim().split(/\s+/).filter(Boolean).length;

  // Sync state when item changes
  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setSummary(item.summary ?? '');
      setContent(item.content ?? '');
      setTags(item.tags ?? []);
      setGroupId(item.knowledge_group_id);
      setIsDirty(false);
    } else {
      setTitle('');
      setSummary('');
      setContent('');
      setTags([]);
      setGroupId(undefined);
      setIsDirty(false);
    }
    setShowDeleteConfirm(false);
    setShowArchiveConfirm(false);
    pendingRawExitContentRef.current = null;
  }, [item?.id]);

  // Close dropdown on outside click
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
        tags,
      });
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  }, [item, title, summary, content, groupId, tags, onSave]);

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
        <p className="text-sm font-medium text-muted-foreground mb-1">
          {t('knowledge.noItemSelected')}
        </p>
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
        <div className="flex items-center gap-2 px-5 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 shrink-0">
          <Archive className="w-3.5 h-3.5 shrink-0" />
          {t('knowledge.archivedView')}
        </div>
      )}

      {/* Header: title + compact properties */}
      <div className="shrink-0 px-6 pt-5 pb-0">
        {/* Title */}
        <input
          type="text"
          value={title}
          disabled={isArchived}
          onChange={(e) => {
            setTitle(e.target.value);
            markDirty();
          }}
          className={cn(
            'w-full text-2xl font-bold bg-transparent outline-none transition-colors border-b-2 pb-1 mb-3',
            isArchived
              ? 'text-muted-foreground cursor-default border-transparent'
              : 'text-foreground border-transparent focus:border-border'
          )}
          placeholder={t('knowledge.titlePlaceholder')}
        />

        {/* Properties block */}
        <div className="flex flex-col gap-1.5 pb-3">
          {/* Group + timestamps row */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            <div className="relative flex items-center gap-1" ref={groupDropdownRef}>
              <span className="text-muted-foreground/50 shrink-0">{t('knowledge.group')}:</span>
              <button
                type="button"
                disabled={isArchived}
                className={cn(
                  'flex items-center gap-0.5 transition-colors',
                  isArchived ? 'cursor-default' : 'hover:text-foreground'
                )}
                onClick={() => !isArchived && setShowGroupDropdown(!showGroupDropdown)}
              >
                <span>{selectedGroupName}</span>
                {!isArchived && <ChevronDown className="w-3 h-3" />}
              </button>
              {showGroupDropdown && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-36 max-h-48 overflow-y-auto">
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
            <span>{t('knowledge.createdAt', { time: formatTimeAgo(item.created_at) })}</span>
            <span>{t('knowledge.savedAt', { time: formatTimeAgo(item.updated_at) })}</span>
            {item.source_clipboard_id != null && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-500 border border-blue-500/20">
                {t('knowledge.sourceClipboard')}
              </span>
            )}
          </div>

          {/* Tags row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground/50 shrink-0">
              {t('knowledge.tags')}:
            </span>
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
              >
                {tag}
                {!isArchived && (
                  <button
                    type="button"
                    onClick={() => {
                      setTags(tags.filter((t) => t !== tag));
                      markDirty();
                    }}
                    className="hover:text-destructive transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </span>
            ))}
            {!isArchived && (
              <div className="relative">
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    setShowTagSuggestions(e.target.value.trim().length > 0);
                  }}
                  onFocus={() => {
                    if (tagInput.trim()) setShowTagSuggestions(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowTagSuggestions(false), 150);
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                      e.preventDefault();
                      const newTag = tagInput.trim().replace(/,+$/, '');
                      if (newTag && !tags.includes(newTag)) {
                        setTags([...tags, newTag]);
                        markDirty();
                      }
                      setTagInput('');
                      setShowTagSuggestions(false);
                    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
                      setTags(tags.slice(0, -1));
                      markDirty();
                    } else if (e.key === 'Escape') {
                      setShowTagSuggestions(false);
                    }
                  }}
                  placeholder={t('knowledge.addTag')}
                  className="text-xs bg-transparent outline-none text-muted-foreground placeholder:text-muted-foreground/40 min-w-20 max-w-32"
                />
                {showTagSuggestions &&
                  (() => {
                    const filtered = allTags.filter(
                      (t) => t.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(t)
                    );
                    if (filtered.length === 0) return null;
                    return (
                      <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-28 max-h-36 overflow-y-auto">
                        {filtered.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            className="w-full flex items-center px-2.5 py-1 text-xs hover:bg-accent text-foreground text-left"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              if (!tags.includes(suggestion)) {
                                setTags([...tags, suggestion]);
                                markDirty();
                              }
                              setTagInput('');
                              setShowTagSuggestions(false);
                              tagInputRef.current?.focus();
                            }}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
              </div>
            )}
          </div>

          {/* Summary row */}
          <div className="flex items-start gap-1.5">
            <span className="text-xs text-muted-foreground/50 shrink-0 pt-px">
              {t('knowledge.summaryLabel')}:
            </span>
            <textarea
              value={summary}
              disabled={isArchived}
              onChange={(e) => {
                setSummary(e.target.value);
                markDirty();
              }}
              rows={2}
              className={cn(
                'flex-1 text-xs bg-transparent outline-none resize-none transition-colors leading-relaxed pt-0',
                isArchived
                  ? 'text-muted-foreground cursor-default'
                  : 'text-muted-foreground placeholder:text-muted-foreground/40 focus:text-foreground'
              )}
              placeholder={t('knowledge.summaryPlaceholder')}
            />
          </div>
        </div>
      </div>

      {/* Divider between properties and editor */}
      <div className="shrink-0 border-t border-border/50" />

      {/* Editor — fills all remaining space */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {/* Editor mode toggle button - fixed to right side */}
        <button
          type="button"
          title={editorMode === 'rich' ? t('knowledge.switchToRaw') : t('knowledge.switchToRich')}
          className={cn(
            'absolute right-2 top-2 z-10 p-1.5 rounded-md transition-colors',
            editorMode === 'raw'
              ? 'bg-primary/10 text-primary hover:bg-primary/20'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
          )}
          onClick={() => {
            if (editorMode === 'raw') {
              pendingRawExitContentRef.current = content;
            }
            setEditorMode(editorMode === 'rich' ? 'raw' : 'rich');
          }}
        >
          <Code2 className="w-3.5 h-3.5" />
        </button>

        {editorMode === 'rich' ? (
          <KnowledgeBlockEditor
            key={`${item.id}-rich`}
            initialContent={item.content ?? ''}
            editable={!isArchived}
            pendingContentRef={pendingRawExitContentRef}
            onContentChange={(md) => {
              setContent(md);
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

      {/* Backlinks — collapsible strip above status bar */}
      {backlinks.length > 0 && (
        <div className="shrink-0 border-t border-border/40 px-5 py-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-medium text-foreground/80 hover:text-foreground transition-colors"
            onClick={() => setShowBacklinks(!showBacklinks)}
          >
            <Link2 className="w-3.5 h-3.5 text-emerald-500" />
            {t('knowledge.backlinks')} ({backlinks.length})
            <ChevronDown
              className={cn(
                'w-3 h-3 ml-0.5 transition-transform',
                showBacklinks ? 'rotate-180' : ''
              )}
            />
          </button>
          {showBacklinks && (
            <div className="flex flex-col gap-1 mt-2">
              {backlinks.map((bl) => (
                <button
                  key={bl.id}
                  type="button"
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs bg-muted/20 hover:bg-muted/40 text-left transition-colors"
                  onClick={() => onNavigateToItem?.(bl.id)}
                >
                  <Link2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span className="text-foreground">{bl.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom action bar */}
      <div className="flex items-center justify-between px-5 py-2 border-t border-border/40 shrink-0 bg-[var(--bg-base)]">
        {/* Left: word count + status */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {t('knowledge.words')}: {wordCount}
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                isDirty ? 'bg-amber-400' : 'bg-green-500'
              )}
            />
            <span>{isDirty ? t('knowledge.unsaved') : t('knowledge.autoSaveOn')}</span>
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1.5">
          {isArchived ? (
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
              onClick={handleRestore}
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t('knowledge.restore')}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10"
                onClick={() => setShowArchiveConfirm(true)}
              >
                <Archive className="w-3 h-3" />
                <span>{t('knowledge.archive')}</span>
              </button>
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="w-3 h-3" />
                <span>{t('knowledge.delete')}</span>
              </button>
            </>
          )}
          {!isArchived && (
            <button
              type="button"
              disabled={isSaving || !title.trim() || !isDirty}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                isDirty && title.trim()
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted/50 text-muted-foreground cursor-default'
              )}
              onClick={handleSave}
            >
              <Save className="w-3 h-3" />
              {isSaving ? '...' : t('knowledge.save')}
            </button>
          )}
        </div>
      </div>

      {/* Confirm overlays */}
      {showDeleteConfirm && (
        <div className="absolute inset-x-0 bottom-0 p-4 bg-background/95 backdrop-blur-sm z-50">
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
        <div className="absolute inset-x-0 bottom-0 p-4 bg-background/95 backdrop-blur-sm z-50">
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
    </div>
  );
}

export default KnowledgeDetailPanel;
