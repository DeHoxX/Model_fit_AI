import { useState, useEffect, useRef } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  deriveTitle,
  loadSavedConversations,
  loadActiveConversationId,
  saveActiveConversationId,
  saveConversations,
  restoreSessionState,
  switchConversation,
  STORAGE_SESSIONS,
  STORAGE_ACTIVE_CONV,
} from '../src/lib/chatStorage';
import { ChatConversation, ChatMessage } from '../src/types/chat';

describe('Chat Session Storage & Title Derivation', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  describe('deriveTitle', () => {
    it('truncates to at most 40 characters with ellipsis', () => {
      const longInput = 'Can I run a massive 70B parameter llama model on my dual RTX 4090 workstation with 64GB system memory?';
      const title = deriveTitle(longInput);

      expect(title.length).toBeLessThanOrEqual(40);
      expect(title.endsWith('...')).toBe(true);
      expect(title).toBe('Can I run a massive 70B parameter lla...');
      expect(title.length).toBe(40);
    });

    it('strips markdown markup and returns clean plain text', () => {
      const markdownInput = '# Sizing: **Llama 3 8B** with `Q4_K_M` on _RTX 4070_ [link](url)';
      const title = deriveTitle(markdownInput);

      // Markdown characters like #, *, `, ~, [, ], (, ) must be stripped
      expect(title).not.toContain('#');
      expect(title).not.toContain('*');
      expect(title).not.toContain('`');
      expect(title).not.toContain('[');
      expect(title).not.toContain(']');
      expect(title).toBe('Sizing: Llama 3 8B with Q4_K_M on RTX...');
      expect(title.length).toBe(40);
    });

    it('collapses multi-space and newline whitespace into single spaces', () => {
      const messyWhitespace = '   Can    my \n\n GPU   run \t Qwen 2.5?   ';
      const title = deriveTitle(messyWhitespace);

      expect(title).toBe('Can my GPU run Qwen 2.5?');
    });

    it('falls back to default title for empty or whitespace-only inputs', () => {
      expect(deriveTitle('')).toBe('New Sizing Inquiry');
      expect(deriveTitle('   \n\t  ')).toBe('New Sizing Inquiry');
      expect(deriveTitle('***```###')).toBe('New Sizing Inquiry');
    });
  });

  describe('save/restore from sessionStorage', () => {
    it('successfully persists and restores conversations with sanitized isStreaming state', () => {
      const mockMessages: ChatMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Can I run Qwen 7B?',
          timestamp: 1000,
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Yes, it fits comfortably with 6.2 GiB headroom.',
          timestamp: 1001,
          isStreaming: true, // Should be normalized to false on restore
        },
      ];

      const mockConversations: ChatConversation[] = [
        {
          id: 'conv-123',
          title: 'Can I run Qwen 7B?',
          createdAt: 1000,
          updatedAt: 1001,
          messages: mockMessages,
        },
      ];

      const saveResult = saveConversations(mockConversations);
      expect(saveResult).toBe(true);

      const restored = loadSavedConversations();
      expect(restored).not.toBeNull();
      expect(restored).toHaveLength(1);
      expect(restored![0].id).toBe('conv-123');
      expect(restored![0].title).toBe('Can I run Qwen 7B?');
      expect(restored![0].messages).toHaveLength(2);
      expect(restored![0].messages[0].content).toBe('Can I run Qwen 7B?');
      // Crucial requirement: isStreaming must be false on restored sessions
      expect(restored![0].messages[1].isStreaming).toBe(false);
    });
  });

  describe('corrupt storage handled safely', () => {
    it('returns null safely without throwing on invalid JSON syntax', () => {
      sessionStorage.setItem(STORAGE_SESSIONS, '{"malformed_json: true, unterminated');

      const restored = loadSavedConversations();
      expect(restored).toBeNull();
    });

    it('returns null safely on non-array stored data', () => {
      sessionStorage.setItem(STORAGE_SESSIONS, JSON.stringify({ notAnArray: true }));
      expect(loadSavedConversations()).toBeNull();

      sessionStorage.setItem(STORAGE_SESSIONS, JSON.stringify(12345));
      expect(loadSavedConversations()).toBeNull();

      sessionStorage.setItem(STORAGE_SESSIONS, JSON.stringify('plain string'));
      expect(loadSavedConversations()).toBeNull();

      sessionStorage.setItem(STORAGE_SESSIONS, JSON.stringify([]));
      expect(loadSavedConversations()).toBeNull();
    });

    it('handles sessionStorage quota and access errors safely during save', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      const result = saveConversations([
        {
          id: 'conv-1',
          title: 'Test',
          createdAt: 1,
          updatedAt: 1,
          messages: [],
        },
      ]);

      // Must not throw, returns false safely
      expect(result).toBe(false);
    });

    it('handles sessionStorage access exception safely during load', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError: The operation is insecure.');
      });

      // Must not throw, returns null safely
      expect(loadSavedConversations()).toBeNull();
    });
  });

  describe('switching conversations swaps messages', () => {
    it('swaps active messages to the target conversation without state leakage', () => {
      const convA: ChatConversation = {
        id: 'conv-a',
        title: 'Qwen 7B Inquiry',
        createdAt: 100,
        updatedAt: 100,
        messages: [
          { id: 'm-a1', role: 'user', content: 'Inquiry for Qwen 7B', timestamp: 100 },
          { id: 'm-a2', role: 'assistant', content: 'Qwen 7B response', timestamp: 101 },
        ],
      };

      const convB: ChatConversation = {
        id: 'conv-b',
        title: 'Llama 3 70B Inquiry',
        createdAt: 200,
        updatedAt: 200,
        messages: [
          { id: 'm-b1', role: 'user', content: 'Can I run Llama 70B?', timestamp: 200 },
          { id: 'm-b2', role: 'assistant', content: 'Llama 70B response', timestamp: 201 },
        ],
      };

      const convList = [convA, convB];

      // Switch to Conversation B
      const switchedToB = switchConversation(convList, 'conv-b');
      expect(switchedToB).not.toBeNull();
      expect(switchedToB!.activeConversationId).toBe('conv-b');
      expect(switchedToB!.messages).toHaveLength(2);
      expect(switchedToB!.messages[0].content).toBe('Can I run Llama 70B?');
      expect(switchedToB!.messages[1].content).toBe('Llama 70B response');

      // Switch to Conversation A
      const switchedToA = switchConversation(convList, 'conv-a');
      expect(switchedToA).not.toBeNull();
      expect(switchedToA!.activeConversationId).toBe('conv-a');
      expect(switchedToA!.messages).toHaveLength(2);
      expect(switchedToA!.messages[0].content).toBe('Inquiry for Qwen 7B');
      expect(switchedToA!.messages[1].content).toBe('Qwen 7B response');

      // Attempt switch to non-existent conversation returns null
      const nonExistent = switchConversation(convList, 'conv-missing');
      expect(nonExistent).toBeNull();
    });
  });

  describe('restore active conversation and race condition prevention', () => {
    it('restores the second stored conversation when active ID points to it', () => {
      const conv1: ChatConversation = {
        id: 'conv-1',
        title: 'Conversation One',
        createdAt: 100,
        updatedAt: 100,
        messages: [{ id: 'm1', role: 'user', content: 'Message 1', timestamp: 100 }],
      };
      const conv2: ChatConversation = {
        id: 'conv-2',
        title: 'Conversation Two',
        createdAt: 200,
        updatedAt: 200,
        messages: [{ id: 'm2', role: 'user', content: 'Message 2 in Conv 2', timestamp: 200 }],
      };

      saveConversations([conv1, conv2]);
      saveActiveConversationId('conv-2');

      const restored = restoreSessionState();
      expect(restored).not.toBeNull();
      expect(restored!.activeConversation.id).toBe('conv-2');
      expect(restored!.activeConversation.messages).toHaveLength(1);
      expect(restored!.activeConversation.messages[0].content).toBe('Message 2 in Conv 2');
    });

    it('falls back to the first conversation if active conversation ID is missing or invalid', () => {
      const conv1: ChatConversation = {
        id: 'conv-1',
        title: 'Conversation One',
        createdAt: 100,
        updatedAt: 100,
        messages: [{ id: 'm1', role: 'user', content: 'Message 1', timestamp: 100 }],
      };
      const conv2: ChatConversation = {
        id: 'conv-2',
        title: 'Conversation Two',
        createdAt: 200,
        updatedAt: 200,
        messages: [{ id: 'm2', role: 'user', content: 'Message 2', timestamp: 200 }],
      };

      saveConversations([conv1, conv2]);
      sessionStorage.removeItem(STORAGE_ACTIVE_CONV);

      const restored = restoreSessionState();
      expect(restored).not.toBeNull();
      expect(restored!.activeConversation.id).toBe('conv-1');
    });

    it('mounts page logic with 2 stored conversations (active = second) and verifies second is restored without overwriting storage', async () => {
      const conv1: ChatConversation = {
        id: 'conv-1',
        title: 'First Chat',
        createdAt: 1000,
        updatedAt: 1000,
        messages: [{ id: 'm-1', role: 'user', content: 'First chat message', timestamp: 1000 }],
      };
      const conv2: ChatConversation = {
        id: 'conv-2',
        title: 'Second Chat',
        createdAt: 2000,
        updatedAt: 2000,
        messages: [{ id: 'm-2', role: 'user', content: 'Second chat message', timestamp: 2000 }],
      };

      // Set up sessionStorage with 2 conversations and active = conv-2
      saveConversations([conv1, conv2]);
      saveActiveConversationId('conv-2');

      // Hook implementing the exact state, restore effect, and write effect from ChatContent
      function useTestChatLifecycle() {
        const [conversations, setConversations] = useState<ChatConversation[]>([
          {
            id: 'conv-default',
            title: 'Current Sizing Inquiry',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [],
          },
        ]);
        const [activeConversationId, setActiveConversationId] = useState<string>('conv-default');
        const [messages, setMessages] = useState<ChatMessage[]>([]);

        const isInitializedRef = useRef(false);
        const lastLoadedConvIdRef = useRef<string | null>(null);
        const lastLoadedMessagesRef = useRef<ChatMessage[] | null>(null);

        // Mount restore effect
        useEffect(() => {
          const state = restoreSessionState();
          if (state) {
            setConversations(state.conversations);
            setActiveConversationId(state.activeConversation.id);
            setMessages(state.activeConversation.messages || []);
            lastLoadedConvIdRef.current = state.activeConversation.id;
            lastLoadedMessagesRef.current = state.activeConversation.messages || [];
          }
          isInitializedRef.current = true;
        }, []);

        // Write synchronization effect
        useEffect(() => {
          if (!isInitializedRef.current) return;

          if (lastLoadedConvIdRef.current !== activeConversationId) {
            lastLoadedConvIdRef.current = activeConversationId;
            lastLoadedMessagesRef.current = messages;
            saveActiveConversationId(activeConversationId);
            return;
          }

          if (lastLoadedMessagesRef.current === messages) {
            return;
          }
          lastLoadedMessagesRef.current = messages;

          setConversations(prev => {
            const updated = prev.map(conv => {
              if (conv.id === activeConversationId) {
                return {
                  ...conv,
                  messages,
                  updatedAt: Date.now(),
                };
              }
              return conv;
            });
            saveConversations(updated);
            saveActiveConversationId(activeConversationId);
            return updated;
          });
        }, [messages, activeConversationId]);

        return { conversations, activeConversationId, messages };
      }

      const { result } = renderHook(() => useTestChatLifecycle());

      // 1. Verify activeConversationId is restored to conv-2 (the second conversation)
      expect(result.current.activeConversationId).toBe('conv-2');

      // 2. Verify active messages match conv-2
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe('Second chat message');

      // 3. Verify storage was NOT overwritten or wiped with initial empty state
      const savedInStorage = loadSavedConversations();
      expect(savedInStorage).not.toBeNull();
      expect(savedInStorage).toHaveLength(2);

      const storedConv2 = savedInStorage!.find(c => c.id === 'conv-2');
      expect(storedConv2).toBeDefined();
      expect(storedConv2!.messages).toHaveLength(1);
      expect(storedConv2!.messages[0].content).toBe('Second chat message');

      const storedConv1 = savedInStorage!.find(c => c.id === 'conv-1');
      expect(storedConv1).toBeDefined();
      expect(storedConv1!.messages).toHaveLength(1);
      expect(storedConv1!.messages[0].content).toBe('First chat message');

      // 4. Verify stored active ID remains conv-2
      expect(loadActiveConversationId()).toBe('conv-2');
    });
  });
});
