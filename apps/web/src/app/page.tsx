'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Activity } from 'lucide-react';
import { UserHardwareProfile } from '@/types/hardware';
import { AIModelSpec, QuantizationType } from '@/types/models';
import { ChatConversation, ChatMessage, QuickReplyOption } from '@/types/chat';
import { DEFAULT_HARDWARE_PROFILE } from '@/services/hardwareDatabase';
import { POPULAR_MODELS } from '@/services/modelDatabase';
import { processAdvisorMessage } from '@/services/advisorFlow';

import { TopToolbar } from '@/components/layout/TopToolbar';
import { Sidebar } from '@/components/layout/Sidebar';
import { ChatHome } from '@/components/chat/ChatHome';
import { ConversationView } from '@/components/chat/ConversationView';
import { AdvancedConfiguration } from '@/components/advanced/AdvancedConfiguration';
import { RecommendationReport } from '@/components/report/RecommendationReport';
import { MyHardwareModal } from '@/components/modals/MyHardwareModal';
import { SettingsModal } from '@/components/modals/SettingsModal';

const STORAGE_CONVOS = 'localiq_conversations_v1';
const STORAGE_HARDWARE = 'localiq_hardware_v1';

const INITIAL_CONVERSATIONS: ChatConversation[] = [
  {
    id: 'conv-coding',
    title: 'Find a coding model',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 1800000,
    messages: [
      {
        id: 'msg-seed-1',
        sender: 'user',
        text: 'I want to run a local AI model for Python coding.',
        timestamp: Date.now() - 3600000
      },
      {
        id: 'msg-seed-2',
        sender: 'assistant',
        text: 'Running local coding models gives you complete code privacy! To tailor the ideal model size, what graphics card (GPU) or computer do you have?',
        timestamp: Date.now() - 3590000,
        quickReplies: [
          { id: 'qr-3060', label: 'NVIDIA RTX 3060 12GB', actionValue: 'I have an NVIDIA RTX 3060 12GB.', category: 'gpu' },
          { id: 'qr-4070', label: 'NVIDIA RTX 4070 12GB', actionValue: 'I have an NVIDIA RTX 4070 12GB.', category: 'gpu' },
          { id: 'qr-apple', label: 'Apple Silicon Mac (M-Series)', actionValue: 'I am on an Apple Silicon Mac with 16GB memory.', category: 'gpu' },
          { id: 'qr-cpu', label: "I don't have a dedicated GPU", actionValue: 'I only have integrated graphics / CPU.', category: 'gpu' }
        ]
      }
    ]
  },
  {
    id: 'conv-llama',
    title: 'Can my laptop run Llama?',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    messages: []
  },
  {
    id: 'conv-docs',
    title: 'Local AI for document analysis',
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 172800000,
    messages: []
  },
  {
    id: 'conv-compare',
    title: 'Compare models for my GPU',
    createdAt: Date.now() - 259200000,
    updatedAt: Date.now() - 259200000,
    messages: []
  }
];

export default function Home() {
  const [currentView, setCurrentView] = useState<'chat' | 'advanced' | 'report'>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Hardware State
  const [hardware, setHardware] = useState<UserHardwareProfile>(() => {
    if (typeof window === 'undefined') return DEFAULT_HARDWARE_PROFILE;
    try {
      const saved = localStorage.getItem(STORAGE_HARDWARE);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_HARDWARE_PROFILE;
  });

  // Model & Advanced Settings State
  const [selectedModel, setSelectedModel] = useState<AIModelSpec>(POPULAR_MODELS[0]);
  const [quantization, setQuantization] = useState<QuantizationType>('Q4_K_M');
  const [contextLength, setContextLength] = useState<number>(8192);
  const [batchSize, setBatchSize] = useState<number>(1);
  const [runtime, setRuntime] = useState<string>('Ollama');

  // Modals
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Conversations State
  const [conversations, setConversations] = useState<ChatConversation[]>(() => {
    if (typeof window === 'undefined') return INITIAL_CONVERSATIONS;
    try {
      const saved = localStorage.getItem(STORAGE_CONVOS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_CONVERSATIONS;
  });

  const [activeConversationId, setActiveConversationId] = useState<string>(
    INITIAL_CONVERSATIONS[0].id
  );

  const [isLoadingAdvisor, setIsLoadingAdvisor] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CONVOS, JSON.stringify(conversations));
    } catch {}
  }, [conversations]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_HARDWARE, JSON.stringify(hardware));
    } catch {}
  }, [hardware]);

  const activeConversation =
    conversations.find(c => c.id === activeConversationId) || conversations[0];
  const messages = activeConversation?.messages || [];
  const hasMessages = messages.length > 0;

  const handleNewChat = () => {
    const newId = `conv-${Date.now()}`;
    const newConv: ChatConversation = {
      id: newId,
      title: 'New Hardware Inquiry',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newId);
    setCurrentView('chat');
  };

  const handleDeleteConversation = (id: string) => {
    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== id);
      if (activeConversationId === id) {
        if (filtered.length > 0) {
          setActiveConversationId(filtered[0].id);
        } else {
          const fallback: ChatConversation = {
            id: `conv-${Date.now()}`,
            title: 'New Hardware Inquiry',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: []
          };
          setActiveConversationId(fallback.id);
          return [fallback];
        }
      }
      return filtered;
    });
  };

  const handleSendMessage = (text: string) => {
    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: Date.now()
    };

    setConversations(prev =>
      prev.map(c => {
        if (c.id !== activeConversationId) return c;
        const isFirst = c.messages.length === 0;
        const newTitle =
          isFirst && c.title === 'New Hardware Inquiry'
            ? text.length > 36
              ? `${text.substring(0, 36)}...`
              : text
            : c.title;

        return {
          ...c,
          title: newTitle,
          updatedAt: Date.now(),
          messages: [...c.messages, userMsg]
        };
      })
    );

    setIsLoadingAdvisor(true);

    setTimeout(() => {
      const result = processAdvisorMessage(text, [...messages, userMsg], hardware);

      if (result.updatedProfile) {
        setHardware(prev => ({ ...prev, ...result.updatedProfile }));
      }

      if (result.recommendationTarget) {
        setSelectedModel(result.recommendationTarget.model);
      }

      setConversations(prev =>
        prev.map(c => {
          if (c.id !== activeConversationId) return c;
          return {
            ...c,
            updatedAt: Date.now(),
            messages: [...c.messages, result.message]
          };
        })
      );

      setIsLoadingAdvisor(false);
    }, 650);
  };

  const handleSelectQuickReply = (option: QuickReplyOption) => {
    handleSendMessage(option.actionValue);
  };

  return (
    <div id="main-content" className="flex h-screen w-screen overflow-hidden bg-[#121615] text-[#e4ece7]">
      {/* Collapsible Left Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={id => {
          setActiveConversationId(id);
          setCurrentView('chat');
        }}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onOpenHardwareModal={() => setIsHardwareModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onNavigateToAdvanced={() => setCurrentView('advanced')}
        onNavigateToReport={() => setCurrentView('report')}
        hasSavedReport={true}
      />

      {/* Main Center Stage */}
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative" role="main">
        {/* Top Header & System Navigation */}
        <header className="relative z-10 flex items-center justify-between border-b border-[#242e2a] bg-[#121615] px-4 py-2.5">
          <div className="flex-1 flex items-center">
            <TopToolbar
              currentView={currentView}
              onNavigate={view => setCurrentView(view)}
              isSidebarOpen={isSidebarOpen}
              onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
              onOpenHardwareModal={() => setIsHardwareModalOpen(true)}
            />
          </div>

          <div className="flex items-center gap-2 pl-2">
            <Link
              href="/status"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 hover:bg-emerald-900/40 transition-colors"
              title="View system health & API readiness"
            >
              <Activity className="w-3.5 h-3.5 animate-pulse" />
              <span>Status</span>
            </Link>
          </div>
        </header>

        {/* Dynamic View Router */}
        {currentView === 'chat' && (
          <section className="flex-1 flex flex-col h-full overflow-hidden" aria-label="Chat Mode">
            {!hasMessages ? (
              <ChatHome onSendMessage={handleSendMessage} />
            ) : (
              <ConversationView
                messages={messages}
                onSendMessage={handleSendMessage}
                onSelectQuickReply={handleSelectQuickReply}
                onViewReport={() => setCurrentView('report')}
                onViewAdvanced={() => setCurrentView('advanced')}
                isLoading={isLoadingAdvisor}
              />
            )}
          </section>
        )}

        {currentView === 'advanced' && (
          <section className="flex-1 flex flex-col h-full overflow-hidden" aria-label="Advanced Configuration">
            <AdvancedConfiguration
              hardware={hardware}
              onChangeHardware={setHardware}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
              quantization={quantization}
              onChangeQuantization={setQuantization}
              contextLength={contextLength}
              onChangeContextLength={setContextLength}
              batchSize={batchSize}
              onChangeBatchSize={setBatchSize}
              runtime={runtime}
              onChangeRuntime={setRuntime}
              onBackToChat={() => setCurrentView('chat')}
              onViewReport={() => setCurrentView('report')}
            />
          </section>
        )}

        {currentView === 'report' && (
          <section className="flex-1 flex flex-col h-full overflow-hidden" aria-label="Recommendation Report">
            <RecommendationReport
              model={selectedModel}
              hardware={hardware}
              quantization={quantization}
              contextLength={contextLength}
              batchSize={batchSize}
              onBackToChat={() => setCurrentView('chat')}
              onOpenAdvanced={() => setCurrentView('advanced')}
              onSelectAlternative={alt => setSelectedModel(alt)}
            />
          </section>
        )}
      </main>

      {/* Modals */}
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
