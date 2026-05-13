import { useRef, useEffect, useState, useCallback } from 'react';
import {
  Sparkles,
  X,
  RotateCcw,
  Send,
  AlertCircle,
  Loader2,
  Bot,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAiChat, type AiMessage, type AiChatMode } from '@/hooks/useAiChat';
import type { KnowledgeItem } from '@/types';

interface AiChatPanelProps {
  attachedNote?: KnowledgeItem | null;
  onClose: () => void;
}

function buildSystemPrompt(note: KnowledgeItem): string {
  return `You are a helpful assistant for a personal knowledge base app.
The user is currently viewing the following note:

Title: ${note.title}
${note.tags.length > 0 ? `Tags: ${note.tags.join(', ')}` : ''}
Content:
${note.content}

Answer questions based on this note and the user's knowledge base. Be concise and helpful.`;
}

function MessageBubble({ message }: { message: AiMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words',
          isUser
            ? 'bg-primary text-primary-foreground'
            : message.isError
              ? 'bg-destructive/10 text-destructive border border-destructive/20'
              : 'bg-muted text-foreground'
        )}
      >
        {message.content}
        {message.isStreaming && !message.content && (
          <span className="inline-flex gap-1 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" />
          </span>
        )}
        {message.isStreaming && message.content && (
          <span className="inline-block w-0.5 h-3.5 bg-current ml-0.5 animate-pulse align-text-bottom" />
        )}
      </div>
    </div>
  );
}

export function AiChatPanel({ attachedNote, onClose }: AiChatPanelProps) {
  const { messages, isStreaming, cliStatus, mode, setMode, send, clear } = useAiChat();
  const [input, setInput] = useState('');
  const [contextAttached, setContextAttached] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset context attachment when note changes
  useEffect(() => {
    setContextAttached(true);
  }, [attachedNote?.id]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const systemPrompt =
      contextAttached && attachedNote ? buildSystemPrompt(attachedNote) : undefined;

    setInput('');
    await send(text, systemPrompt);
  }, [input, isStreaming, contextAttached, attachedNote, send]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Not installed state
  if (cliStatus && !cliStatus.installed) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader
          onClose={onClose}
          onClear={clear}
          hasMessages={messages.length > 0}
          mode={mode}
          onModeChange={setMode}
        />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-5 text-center">
          <AlertCircle className="size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium mb-1">Claude CLI not installed</p>
            <p className="text-xs text-muted-foreground mb-3">
              Install Claude Code to use AI features
            </p>
            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
              brew install --cask claude-code
            </code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        onClose={onClose}
        onClear={clear}
        hasMessages={messages.length > 0}
        mode={mode}
        onModeChange={setMode}
      />

      {/* Context chip – chat mode only */}
      {mode === 'chat' && attachedNote && contextAttached && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b bg-muted/30 shrink-0">
          <Sparkles className="size-3 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
            {attachedNote.title}
          </span>
          <button
            type="button"
            className="p-0.5 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            onClick={() => setContextAttached(false)}
            title="Remove context"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            {mode === 'agent' ? (
              <Bot className="size-6 text-muted-foreground/50" />
            ) : (
              <Sparkles className="size-6 text-muted-foreground/50" />
            )}
            <p className="text-xs text-muted-foreground">
              {mode === 'agent'
                ? 'Agent mode: Claude can search your knowledge base'
                : attachedNote
                  ? `Ask anything about "${attachedNote.title}"`
                  : 'Ask Claude anything'}
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            className="flex-1 min-h-[36px] max-h-[120px] resize-none text-sm bg-transparent outline-none placeholder:text-muted-foreground leading-relaxed py-1.5"
            placeholder={
              isStreaming
                ? 'Claude is thinking…'
                : mode === 'agent'
                  ? 'Ask Claude to search your notes…'
                  : 'Message Claude…'
            }
            value={input}
            disabled={isStreaming}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-resize
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            disabled={!input.trim() || isStreaming}
            className={cn(
              'p-1.5 rounded-lg transition-colors shrink-0 mb-0.5',
              input.trim() && !isStreaming
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-default'
            )}
            onClick={handleSend}
          >
            {isStreaming ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function PanelHeader({
  onClose,
  onClear,
  hasMessages,
  mode,
  onModeChange,
}: {
  onClose: () => void;
  onClear: () => void;
  hasMessages: boolean;
  mode: AiChatMode;
  onModeChange: (m: AiChatMode) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 h-9 border-b shrink-0">
      <Sparkles className="size-3.5 text-primary shrink-0" />
      <span className="text-sm font-medium flex-1">AI Assistant</span>

      {/* Mode toggle */}
      <div className="flex items-center rounded-md border overflow-hidden text-xs">
        <button
          type="button"
          title="Chat mode: single-note context"
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 transition-colors',
            mode === 'chat'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent/50'
          )}
          onClick={() => onModeChange('chat')}
        >
          <MessageSquare className="size-3" />
          Chat
        </button>
        <button
          type="button"
          title="Agent mode: Claude can search your full knowledge base"
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 transition-colors',
            mode === 'agent'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent/50'
          )}
          onClick={() => onModeChange('agent')}
        >
          <Bot className="size-3" />
          Agent
        </button>
      </div>

      {hasMessages && (
        <button
          type="button"
          className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
          onClick={onClear}
          title="Clear conversation"
        >
          <RotateCcw className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
        onClick={onClose}
        title="Close AI panel"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
