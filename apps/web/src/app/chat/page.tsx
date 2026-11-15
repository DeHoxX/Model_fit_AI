'use client';

import React, { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import {
  Cpu,
  Send,
  Square,
  RotateCcw,
  AlertCircle,
  PanelLeft,
  Activity,
  Calculator,
  Compass,
  Check,
  X,
  Layers,
} from 'lucide-react';
import { useChatStream } from '@/lib/useChatStream';
import { RecommendationCardView } from '@/components/chat/RecommendationCardView';
import { Sidebar } from '@/components/layout/Sidebar';
import { MyHardwareModal } from '@/components/modals/MyHardwareModal';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { ChatConversation, ChatMessage } from '@/types/chat';
import { UserHardwareProfile } from '@/types/hardware';
import { POPULAR_GPUS } from '@/services/hardwareDatabase';

const QUICK_STARTERS = [
  'I have an NVIDIA RTX 4070 12GB and need a local coding model with 8k context.',
  'Can an Apple Silicon Mac with 16GB memory run Llama 3 8B at Q4 quantization?',
  'Recommend the best reasoning models that fit into an 8GB VRAM graphics card.',
];

const DEFAULT_HARDWARE: UserHardwareProfile = {
  gpu: POPULAR_GPUS[0],
  systemRamGB: 32,
  occupiedRamGB: 8,
  operatingSystem: 'windows',
};

import {
  STORAGE_SESSIONS,
  STORAGE_ACTIVE_CONV,
  STORAGE_HARDWARE,
  DEFAULT_CONVERSATION_TITLES,
  deriveTitle,
  loadSavedConversations,
  loadActiveConversationId,
  saveActiveConversationId,
  saveConversations,
  restoreSessionState,
} from '@/lib/chatStorage';

function ChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const repoIdParam = searchParams.get('repo_id');

  const {
    messages,
    setMessages,
    isStreaming,
    activeTool,
    error,
    sendMessage,
    stopStream,
    retryLast,
    clearMessages,
  } = useChatStream();

  const [input, setInput] = useState('');
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(repoIdParam);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [hardware, setHardware] = useState<UserHardwareProfile>(DEFAULT_HARDWARE);
  const [runtime, setRuntime] = useState('llama_cpp');

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
  const isInitializedRef = useRef(false);
  const lastLoadedConvIdRef = useRef<string | null>(null);
  const lastLoadedMessagesRef = useRef<ChatMessage[] | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prefillHandledRef = useRef<string | null>(null);

  // Handle repo_id query param prefill without auto-sending
  useEffect(() => {
    if (repoIdParam && prefillHandledRef.current !== repoIdParam) {
      prefillHandledRef.current = repoIdParam;
      setSelectedRepoId(repoIdParam);
      setInput(`Can I run ${repoIdParam} on my hardware? Tell me its memory needs.`);
    }
  }, [repoIdParam]);

  // Load hardware and restore active conversation from sessionStorage on mount
  useEffect(() => {
    try {
      const savedHw = localStorage.getItem(STORAGE_HARDWARE);
      if (savedHw) {
        setHardware(JSON.parse(savedHw));
      }

      const state = restoreSessionState();
      if (state) {
        setConversations(state.conversations);
        setActiveConversationId(state.activeConversation.id);
        setMessages(state.activeConversation.messages || []);
        lastLoadedConvIdRef.current = state.activeConversation.id;
        lastLoadedMessagesRef.current = state.activeConversation.messages || [];
      }
    } catch {
      // Safe fallback on corrupt or inaccessible storage
    } finally {
      isInitializedRef.current = true;
    }
  }, [setMessages]);

  // Synchronize messages changes into active conversation and sessionStorage
  useEffect(() => {
    // Prevent race: do not write to storage before restore effect has fully initialized state
    if (!isInitializedRef.current) {
      return;
    }

    // Guard against race conditions during conversation switching / state updates:
    // If active conversation ID does not match the loaded conversation ID, or if
    // messages haven't changed from what was loaded/synced for this conversation,
    // do not overwrite the stored conversation with stale messages.
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
          // Only store role, content, recommendations, and basic status (never keys or tool internals)
          const sanitizedMsgs: ChatMessage[] = messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            recommendations: m.recommendations ? [...m.recommendations] : [],
            timestamp: m.timestamp,
            error: m.error,
            errorCode: m.errorCode,
            isStreaming: false,
          }));

          let title = conv.title;
          if (DEFAULT_CONVERSATION_TITLES.includes(title)) {
            const firstUser = sanitizedMsgs.find(m => m.role === 'user');
            if (firstUser && firstUser.content) {
              title = deriveTitle(firstUser.content);
            }
          }

          return {
            ...conv,
            title,
            updatedAt: Date.now(),
            messages: sanitizedMsgs,
          };
        }
        return conv;
      });

      saveConversations(updated);
      saveActiveConversationId(activeConversationId);
      return updated;
    });
  }, [messages, activeConversationId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, activeTool]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const textToSend = input;
    setInput('');
    sendMessage(textToSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSelectConversation = (id: string) => {
    if (id === activeConversationId) return;
    stopStream();
    const target = conversations.find(c => c.id === id);
    if (target) {
      lastLoadedConvIdRef.current = id;
      lastLoadedMessagesRef.current = target.messages || [];
      setActiveConversationId(id);
      setMessages(target.messages || []);
      saveActiveConversationId(id);
    }
  };

  const handleNewChat = () => {
    stopStream();
    clearMessages();
    setSelectedRepoId(null);
    const newId = `conv-${Date.now()}`;
    const newConv: ChatConversation = {
      id: newId,
      title: 'New Sizing Inquiry',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    lastLoadedConvIdRef.current = newId;
    lastLoadedMessagesRef.current = [];
    setConversations(prev => {
      const updated = [newConv, ...prev];
      saveConversations(updated);
      return updated;
    });
    setActiveConversationId(newId);
    saveActiveConversationId(newId);
  };

  const handleDeleteConversation = (id: string) => {
    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== id);
      let nextActiveId = activeConversationId;
      let nextMessages: ChatMessage[] = [];

      if (activeConversationId === id) {
        if (filtered.length > 0) {
          nextActiveId = filtered[0].id;
          nextMessages = filtered[0].messages || [];
        } else {
          const fallback: ChatConversation = {
            id: `conv-${Date.now()}`,
            title: 'New Sizing Inquiry',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [],
          };
          filtered.push(fallback);
          nextActiveId = fallback.id;
          nextMessages = [];
        }
        lastLoadedConvIdRef.current = nextActiveId;
        lastLoadedMessagesRef.current = nextMessages;
        setActiveConversationId(nextActiveId);
        setMessages(nextMessages);
        saveActiveConversationId(nextActiveId);
      }

      saveConversations(filtered);
      return filtered;
    });
  };

  const toolDisplayMap: Record<string, string> = {
    search_models: 'Searching Hugging Face Hub catalog...',
    get_model_details: 'Inspecting safetensors headers & config...',
    recommend_models: 'Running deterministic memory ranking...',
    estimate_memory: 'Calculating memory & headroom breakdown...',
    list_hardware: 'Retrieving hardware profiles...',
  };

  return (
    <div id="main-content" className="flex h-screen w-screen overflow-hidden bg-[#0e1211] text-[#e4ece7]">
      {/* Restored Collapsible Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onOpenHardwareModal={() => setIsHardwareModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onNavigateToAdvanced={() => router.push('/estimator')}
        onNavigateToReport={() => {}}
        hasSavedReport={false}
      />

      {/* Main Chat Stage */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        {/* Top Header Navigation */}
        <header className="h-14 border-b border-[#1d2622] bg-[#111714]/90 backdrop-blur px-4 flex items-center justify-between flex-shrink-0 z-20">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(prev => !prev)}
              className="p-1.5 rounded-lg text-[#96a99e] hover:text-[#e4ece7] hover:bg-[#18201d] transition-colors"
              title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              aria-label="Toggle sidebar"
              id="sidebar-toggle-btn"
            >
              <PanelLeft size={18} />
            </button>

            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-7 h-7 rounded-lg bg-[#1c2923] border border-[#2d4237] flex items-center justify-center text-[#75a691] shadow-inner">
                <Cpu size={15} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs sm:text-sm font-semibold tracking-tight text-[#e4ece7] group-hover:text-[#a0c5b3] transition-colors">
                  ModelFit AI
                </span>
                <span className="text-[10px] text-[#617369] hidden sm:block -mt-0.5">
                  Deterministic Memory Advisor
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/models"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#708479] hover:text-[#e4ece7] hover:bg-[#16211c] border border-transparent hover:border-[#24332b] transition-colors"
              title="Open Hugging Face Model Catalog"
            >
              <Compass size={14} className="text-[#75a691]" />
              <span className="hidden sm:inline">Model Catalog</span>
            </Link>

            <Link
              href="/estimator"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#708479] hover:text-[#e4ece7] hover:bg-[#16211c] border border-transparent hover:border-[#24332b] transition-colors"
              title="Open Deterministic Memory Estimator"
            >
              <Calculator size={14} className="text-[#75a691]" />
              <span className="hidden sm:inline">Estimator</span>
            </Link>

            <Link
              href="/status"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 hover:bg-emerald-900/40 transition-colors"
              title="View system health & API readiness"
            >
              <Activity size={13} className="animate-pulse" />
              <span className="hidden sm:inline">Status</span>
            </Link>
          </div>
        </header>

        {/* Message Thread */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5 max-w-4xl mx-auto w-full">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-lg mx-auto space-y-6">
              <div className="w-12 h-12 rounded-2xl bg-[#18241e] border border-[#2b3d33] flex items-center justify-center text-[#75a691] shadow-lg">
                <Cpu size={24} />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold text-[#e4ece7]">
                  What model would you like to run?
                </h2>
                <p className="text-xs text-[#708479] leading-relaxed">
                  Ask about your hardware profile, context sizing, or Hugging Face models.
                  All memory verdicts and headroom calculations are verified deterministically.
                </p>
              </div>

              <div className="w-full space-y-2 pt-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#52635a]">
                  Quick starters
                </div>
                <div className="space-y-1.5">
                  {QUICK_STARTERS.map((starter, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setInput(starter);
                        inputRef.current?.focus();
                      }}
                      className="w-full text-left text-xs p-3 rounded-xl bg-[#131b17] hover:bg-[#18231e] border border-[#202c26] hover:border-[#2f4237] text-[#96a99e] hover:text-[#e4ece7] transition-colors"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-3 text-xs sm:text-sm ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-[#18241e] border border-[#293a30] flex items-center justify-center text-[#75a691] flex-shrink-0 mt-0.5">
                    <Cpu size={14} />
                  </div>
                )}

                <div
                  className={`rounded-2xl px-4 py-3 max-w-[85%] sm:max-w-[78%] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#1e2e26] text-[#e4ece7] border border-[#2e473b] rounded-tr-sm'
                      : 'bg-[#121915] text-[#e4ece7] border border-[#1f2b24] rounded-tl-sm w-full'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div>
                      {/* Live Tool Execution Status */}
                      {msg.toolEvents && msg.toolEvents.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2.5 pb-2 border-b border-[#1b2520]">
                          {msg.toolEvents.map((tool, idx) => (
                            <span
                              key={idx}
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                                tool.status === 'running'
                                  ? 'bg-[#2a2212] border-[#48391b] text-[#fbbf24] animate-pulse'
                                  : 'bg-[#16231d] border-[#2a3c33] text-[#75a691]'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              <span>{tool.name}</span>
                              {tool.status === 'completed' && <Check size={10} />}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Markdown Response Content */}
                      {msg.content ? (
                        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-headings:my-2 prose-pre:bg-[#0d1210] prose-pre:border prose-pre:border-[#202c26] text-xs sm:text-sm text-[#d1dcd5]">
                          <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        isStreaming &&
                        msg.isStreaming && (
                          <div className="flex items-center gap-2 text-xs text-[#708479] italic py-1">
                            <span className="w-2 h-2 rounded-full bg-[#75a691] animate-ping" />
                            <span>Thinking and calculating deterministic constraints...</span>
                          </div>
                        )
                      )}

                      {/* Grounded Recommendation Cards */}
                      {msg.recommendations && msg.recommendations.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-[#1b2520] space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-[#75a691] font-semibold">
                            <span>Deterministic Model Recommendations</span>
                            <span className="text-[10px] font-normal text-[#708479]">
                              {msg.recommendations.length} candidate
                              {msg.recommendations.length > 1 ? 's' : ''} fit
                            </span>
                          </div>
                          {msg.recommendations.map(rec => (
                            <RecommendationCardView key={rec.model_id} candidate={rec} />
                          ))}
                        </div>
                      )}

                      {/* Inline Error with Error Code Badge */}
                      {msg.error && (
                        <div className="mt-2.5 p-2.5 rounded-lg bg-[#291717] border border-[#522b2b] text-[#fca5a5] text-xs flex items-start gap-2">
                          <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-[#ef4444]" />
                          <div>
                            <div className="font-semibold flex items-center gap-2">
                              <span>
                                {msg.errorCode === 'LLM_MODEL_BUSY'
                                  ? 'Model Busy'
                                  : msg.errorCode === 'LLM_NETWORK_ERROR'
                                  ? 'Connection Error'
                                  : msg.errorCode === 'LLM_RATE_LIMITED'
                                  ? 'Rate Limited'
                                  : msg.errorCode === 'LLM_AUTH_ERROR'
                                  ? 'Authentication Error'
                                  : 'Inference Error'}
                              </span>
                              {msg.errorCode && (
                                <span className="font-mono text-[10px] bg-[#3b2020] border border-[#5c2e2e] text-[#fca5a5] px-1.5 py-0.5 rounded">
                                  {msg.errorCode}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-[11px] text-[#f87171]">{msg.error}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Active Tool Pill */}
          {isStreaming && activeTool && (
            <div className="flex items-center gap-2 text-xs text-[#fbbf24] bg-[#221c10] border border-[#48391b] px-3 py-1.5 rounded-full w-fit animate-pulse">
              <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
              <span>{toolDisplayMap[activeTool] || `Executing ${activeTool}...`}</span>
            </div>
          )}

          {/* Global Stream Error with Code Badge and Retry */}
          {error && !isStreaming && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-[#291717] border border-[#522b2b] text-xs text-[#fca5a5]">
              <div className="flex items-center gap-2">
                <AlertCircle size={15} className="flex-shrink-0 text-[#ef4444]" />
                <span className="font-mono">{error}</span>
              </div>
              {!error.includes('LLM_AUTH_ERROR') && (
                <button
                  type="button"
                  onClick={retryLast}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg bg-[#3b2020] hover:bg-[#4d2929] text-[#fca5a5] border border-[#5c2e2e] font-medium transition-colors self-start sm:self-auto"
                >
                  <RotateCcw size={12} />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </main>

        {/* Message Composer & Controls */}
        <footer className="p-3 sm:p-4 border-t border-[#1d2622] bg-[#111714]/95 backdrop-blur flex-shrink-0">
          <div className="max-w-4xl mx-auto w-full">
            {/* Model Target Chip if present */}
            {selectedRepoId && (
              <div className="flex items-center gap-2 mb-2 w-fit">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#16231d] border border-[#2b3e34] text-xs text-[#a0c5b3] shadow-sm">
                  <Layers size={12} className="text-[#75a691]" />
                  <span className="font-mono text-[11px]">Model: {selectedRepoId}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedRepoId(null)}
                    className="p-0.5 text-[#708479] hover:text-[#e4ece7] rounded-full hover:bg-[#203028] transition-colors ml-0.5"
                    title="Remove model target"
                    id="remove-repo-chip-btn"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            )}

            {/* Controls Bar */}
            <div className="flex items-center justify-between mb-2 px-1 text-xs text-[#708479]">
              <span className="hidden sm:inline text-[11px]">
                Deterministic single source of truth for local hardware memory sizing
              </span>

              <div className="flex items-center gap-2 ml-auto">
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={stopStream}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#291717] hover:bg-[#3b2020] border border-[#522b2b] text-[#fca5a5] text-xs transition-colors shadow-sm"
                  >
                    <Square size={12} className="fill-current" />
                    <span>Stop Generation</span>
                  </button>
                ) : (
                  messages.length > 0 && (
                    <button
                      type="button"
                      onClick={retryLast}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#16211c] hover:bg-[#1e2e26] border border-[#26372f] text-[#96a99e] hover:text-[#e4ece7] text-[11px] transition-colors"
                    >
                      <RotateCcw size={11} />
                      <span>Regenerate Last</span>
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="relative flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about model sizing or local compatibility (e.g. 'Can I run Qwen 2.5 on RTX 4070?')..."
                className="w-full bg-[#0d1210] text-[#e4ece7] placeholder-[#52635a] border border-[#24332c] focus:border-[#405c4d] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm resize-none min-h-[44px] max-h-32 focus:outline-none transition-colors"
                id="chat-input-textarea"
              />

              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                aria-label="Send message"
                className="h-[44px] w-[44px] rounded-xl bg-[#22332a] hover:bg-[#2b4135] border border-[#3b5246] hover:border-[#4d6b5c] text-[#a0c5b3] flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                id="chat-send-btn"
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        </footer>
      </div>

      {/* Hardware & Settings Modals */}
      <MyHardwareModal
        isOpen={isHardwareModalOpen}
        onClose={() => setIsHardwareModalOpen(false)}
        hardware={hardware}
        onSave={setHardware}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        defaultRuntime={runtime}
        onSaveRuntime={setRuntime}
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0e1211] text-[#e4ece7]" />}>
      <ChatContent />
    </Suspense>
  );
}
