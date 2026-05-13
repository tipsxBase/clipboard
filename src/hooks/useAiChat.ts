import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isError?: boolean;
}

interface ClaudeStreamEvent {
  kind: 'Init' | 'TextDelta' | 'ThinkingDelta' | 'Error' | 'Done';
  session_id?: string;
  text?: string;
  message?: string;
}

interface ClaudeCliStatus {
  installed: boolean;
  version: string | null;
}

interface McpServerInfo {
  port: number;
  server_path: string;
}

export type AiChatMode = 'chat' | 'agent';

export function useAiChat() {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cliStatus, setCliStatus] = useState<ClaudeCliStatus | null>(null);
  const [mode, setModeState] = useState<AiChatMode>('chat');

  const unlistenRef = useRef<UnlistenFn | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);
  // Lazily cached MCP server info – fetched once and reused
  const mcpInfoRef = useRef<McpServerInfo | null>(null);

  // Check claude CLI on mount
  useEffect(() => {
    invoke<ClaudeCliStatus>('check_claude_cli')
      .then(setCliStatus)
      .catch(() => setCliStatus({ installed: false, version: null }));
  }, []);

  /** Fetch MCP server info once and cache it. */
  const ensureMcpInfo = useCallback(async (): Promise<McpServerInfo> => {
    if (mcpInfoRef.current) return mcpInfoRef.current;
    const info = await invoke<McpServerInfo>('get_mcp_server_info');
    mcpInfoRef.current = info;
    return info;
  }, []);

  /** Switch mode and clear the conversation (sessions are mode-specific). */
  const setMode = useCallback((next: AiChatMode) => {
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    setMessages([]);
    setSessionId(null);
    setIsStreaming(false);
    streamingMsgIdRef.current = null;
    setModeState(next);
  }, []);

  const send = useCallback(
    async (text: string, systemPrompt?: string) => {
      if (!text.trim() || isStreaming) return;

      const userMsgId = crypto.randomUUID();
      const assistantMsgId = crypto.randomUUID();
      streamingMsgIdRef.current = assistantMsgId;

      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: 'user', content: text },
        { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true },
      ]);
      setIsStreaming(true);

      // Listen for streaming events before invoking
      let capturedSessionId = sessionId;

      const unlisten = await listen<ClaudeStreamEvent>('claude-stream', (event) => {
        const payload = event.payload;

        if (payload.kind === 'Init' && payload.session_id) {
          capturedSessionId = payload.session_id;
        }

        if (payload.kind === 'TextDelta' && payload.text) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: m.content + payload.text! } : m
            )
          );
        }

        if (payload.kind === 'Error') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: payload.message ?? 'Unknown error',
                    isStreaming: false,
                    isError: true,
                  }
                : m
            )
          );
          setIsStreaming(false);
          unlisten();
        }

        if (payload.kind === 'Done') {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m))
          );
          setIsStreaming(false);
          setSessionId(capturedSessionId);
          unlisten();
        }
      });

      unlistenRef.current = unlisten;

      try {
        let newSessionId: string;

        if (mode === 'agent') {
          const mcpInfo = await ensureMcpInfo();
          newSessionId = await invoke<string>('stream_claude_chat_agent', {
            request: {
              message: text,
              session_id: sessionId ?? null,
              mcp_server_path: mcpInfo.server_path,
              api_port: mcpInfo.port,
            },
          });
        } else {
          newSessionId = await invoke<string>('stream_claude_chat', {
            request: {
              message: text,
              system_prompt: systemPrompt ?? null,
              session_id: sessionId ?? null,
            },
          });
        }

        if (newSessionId) {
          setSessionId(newSessionId);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: errMsg, isStreaming: false, isError: true }
              : m
          )
        );
        setIsStreaming(false);
        unlisten();
      }
    },
    [isStreaming, sessionId, mode, ensureMcpInfo]
  );

  const clear = useCallback(() => {
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    setMessages([]);
    setSessionId(null);
    setIsStreaming(false);
    streamingMsgIdRef.current = null;
  }, []);

  return {
    messages,
    isStreaming,
    sessionId,
    cliStatus,
    mode,
    setMode,
    send,
    clear,
  };
}
