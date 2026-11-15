import { ChatConversation, ChatMessage } from '@/types/chat';

export const STORAGE_SESSIONS = 'modelfit_chat_sessions_v1';
export const STORAGE_ACTIVE_CONV = 'modelfit_chat_active_conv_v1';
export const STORAGE_HARDWARE = 'modelfit_hardware_profile_v1';

export const DEFAULT_CONVERSATION_TITLES = [
  'Current Sizing Inquiry',
  'New Hardware Inquiry',
  'New Sizing Inquiry',
];

/**
 * Derives a plain text title of at most 40 characters from the first user prompt.
 * Strips markdown markup, normalizes whitespace, and truncates if necessary.
 */
export function deriveTitle(firstMsg: string): string {
  const clean = firstMsg
    .replace(/[#*`~[\]()]/g, '')
    .replace(/(^|\s)_+(.*?)(?<=\S)_+($|\s)/g, '$1$2$3')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 'New Sizing Inquiry';
  return clean.length > 40 ? clean.substring(0, 37) + '...' : clean;
}

/**
 * Loads and validates chat conversations from sessionStorage.
 * Returns null safely if storage is empty, inaccessible, or corrupt.
 * Sanitizes messages to ensure isStreaming is never true on restore.
 */
export function loadSavedConversations(): ChatConversation[] | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const saved = window.sessionStorage.getItem(STORAGE_SESSIONS);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    return parsed.map((c: ChatConversation) => ({
      ...c,
      messages: Array.isArray(c.messages)
        ? c.messages.map((m: ChatMessage) => ({ ...m, isStreaming: false }))
        : [],
    }));
  } catch {
    return null;
  }
}

/**
 * Loads the active conversation ID from sessionStorage.
 */
export function loadActiveConversationId(): string | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    return window.sessionStorage.getItem(STORAGE_ACTIVE_CONV);
  } catch {
    return null;
  }
}

/**
 * Persists the active conversation ID to sessionStorage.
 */
export function saveActiveConversationId(id: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return false;
    window.sessionStorage.setItem(STORAGE_ACTIVE_CONV, id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely persists conversations to sessionStorage, ignoring quota exceptions.
 */
export function saveConversations(conversations: ChatConversation[]): boolean {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return false;
    window.sessionStorage.setItem(STORAGE_SESSIONS, JSON.stringify(conversations));
    return true;
  } catch {
    return false;
  }
}

/**
 * Restores full chat session state including selecting the previously active conversation.
 * Falls back to the first conversation if active id is missing or not found.
 */
export function restoreSessionState(): {
  conversations: ChatConversation[];
  activeConversation: ChatConversation;
} | null {
  const convos = loadSavedConversations();
  if (!convos || convos.length === 0) return null;

  const activeId = loadActiveConversationId();
  const active = (activeId && convos.find(c => c.id === activeId)) || convos[0];

  return {
    conversations: convos,
    activeConversation: active,
  };
}

/**
 * Resolves target conversation messages when switching conversations.
 */
export function switchConversation(
  conversations: ChatConversation[],
  targetId: string
): { activeConversationId: string; messages: ChatMessage[] } | null {
  const target = conversations.find(c => c.id === targetId);
  if (!target) return null;
  return {
    activeConversationId: target.id,
    messages: target.messages || [],
  };
}
