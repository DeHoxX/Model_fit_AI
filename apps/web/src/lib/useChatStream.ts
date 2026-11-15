'use client';

import { useState, useRef, useCallback } from 'react';
import { ChatMessage, RecommendationCandidate, ToolEvent } from '@/types/chat';

export interface SSEParsedEvent {
  event: string;
  data: Record<string, unknown>;
}

export function parseSSEChunk(
  chunk: string,
  buffer: string
): { events: SSEParsedEvent[]; remainingBuffer: string } {
  const combined = buffer + chunk;
  const rawEvents = combined.split('\n\n');
  const remainingBuffer = rawEvents.pop() ?? '';
  const events: SSEParsedEvent[] = [];

  for (const block of rawEvents) {
    if (!block.trim()) continue;
    let eventType = 'message';
    let dataStr = '';

    const lines = block.split('\n');
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.substring(7).trim();
      } else if (line.startsWith('data: ')) {
        dataStr = line.substring(6).trim();
      }
    }

    if (dataStr) {
      try {
        const parsedData = JSON.parse(dataStr);
        events.push({ event: eventType, data: parsedData });
      } catch {
        // Fallback for unparseable JSON
        events.push({ event: eventType, data: { raw: dataStr } });
      }
    }
  }

  return { events, remainingBuffer };
}

export function useChatStream(initialMessages: ChatMessage[] = []) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
      setActiveTool(null);
      setMessages(prev =>
        prev.map(m => (m.isStreaming ? { ...m, isStreaming: false } : m))
      );
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string, currentHistory?: ChatMessage[]) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      setError(null);
      setActiveTool(null);

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };

      const assistantMsgId = `assistant-${Date.now() + 1}`;
      const placeholderAssistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now() + 1,
        isStreaming: true,
        toolEvents: [],
        recommendations: [],
      };

      const baseHistory = currentHistory || messages;
      const updatedMessages = [...baseHistory, userMsg, placeholderAssistantMsg];
      setMessages(updatedMessages);
      setIsStreaming(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Prepare API payload with bounded message history
      const historyPayload = [...baseHistory, userMsg]
        .slice(-20)
        .map(m => ({ role: m.role, content: m.content }));

      let accumulatedContent = '';
      const toolEvents: ToolEvent[] = [];
      let recommendations: RecommendationCandidate[] = [];
      let sseBuffer = '';

      try {
        const response = await fetch('/api/v1/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ messages: historyPayload }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let errorMsg = `Server returned status ${response.status}`;
          try {
            const errData = await response.json();
            if (errData?.error?.message) {
              errorMsg = errData.error.message;
            }
          } catch {
            // fallback
          }
          throw new Error(errorMsg);
        }

        if (!response.body) {
          throw new Error('ReadableStream not supported by browser.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const { events, remainingBuffer } = parseSSEChunk(chunk, sseBuffer);
          sseBuffer = remainingBuffer;

          for (const ev of events) {
            if (ev.event === 'token') {
              const textDelta = String(ev.data.text ?? '');
              accumulatedContent += textDelta;
            } else if (ev.event === 'tool_call') {
              const toolName = String(ev.data.name ?? 'calculating');
              setActiveTool(toolName);
              toolEvents.push({ name: toolName, status: 'running' });
            } else if (ev.event === 'tool_result') {
              const toolName = String(ev.data.name ?? '');
              setActiveTool(null);
              const found = toolEvents.find(t => t.name === toolName);
              if (found) found.status = 'completed';
            } else if (ev.event === 'recommendation') {
              const recs = (ev.data.recommendations as RecommendationCandidate[]) || [];
              recommendations = recs;
            } else if (ev.event === 'error') {
              const errObj = ev.data.error as { code?: string; message?: string } | undefined;
              const errCode = errObj?.code;
              const msg = errObj?.message || 'Chat generation failed.';
              const displayErr = errCode ? `[${errCode}] ${msg}` : msg;
              setError(displayErr);
              setActiveTool(null);
              setIsStreaming(false);
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        isStreaming: false,
                        error: msg,
                        errorCode: errCode,
                      }
                    : m
                )
              );
            } else if (ev.event === 'done') {
              setIsStreaming(false);
              setActiveTool(null);
            }

            // Update UI state with streamed updates
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: accumulatedContent,
                      toolEvents: [...toolEvents],
                      recommendations: [...recommendations],
                    }
                  : m
              )
            );
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Stream cancelled by user
        } else {
          const errString = err instanceof Error ? err.message : 'Connection interrupted.';
          setError(errString);
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    error: errString,
                  }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
        setActiveTool(null);
        abortControllerRef.current = null;
        setMessages(prev =>
          prev.map(m => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m))
        );
      }
    },
    [isStreaming, messages]
  );

  const retryLast = useCallback(() => {
    stopStream();
    const lastUserIndex = [...messages].reverse().findIndex(m => m.role === 'user');
    if (lastUserIndex === -1) return;

    const actualIndex = messages.length - 1 - lastUserIndex;
    const lastUserMsg = messages[actualIndex];
    const previousHistory = messages.slice(0, actualIndex);

    setMessages(previousHistory);
    sendMessage(lastUserMsg.content, previousHistory);
  }, [messages, stopStream, sendMessage]);

  const clearMessages = useCallback(() => {
    stopStream();
    setMessages([]);
    setError(null);
  }, [stopStream]);

  return {
    messages,
    setMessages,
    isStreaming,
    activeTool,
    error,
    sendMessage,
    stopStream,
    retryLast,
    clearMessages,
  };
}
