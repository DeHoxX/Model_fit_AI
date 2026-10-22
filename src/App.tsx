import React, { useState, useEffect } from 'react';
import { UserHardwareProfile } from './types/hardware';
import { AIModelSpec, QuantizationType } from './types/models';
import { ChatConversation, ChatMessage, QuickReplyOption } from './types/chat';
import { DEFAULT_HARDWARE_PROFILE } from './services/hardwareDatabase';
import { POPULAR_MODELS } from './services/modelDatabase';
import { processAdvisorMessage } from './services/advisorFlow';

import { TopToolbar } from './components/layout/TopToolbar';
import { Sidebar } from './components/layout/Sidebar';
import { ChatHome } from './components/chat/ChatHome';
import { ConversationView } from './components/chat/ConversationView';
import { AdvancedConfiguration } from './components/advanced/AdvancedConfiguration';
import { RecommendationReport } from './components/report/RecommendationReport';
import { MyHardwareModal } from './components/modals/MyHardwareModal';
import { SettingsModal } from './components/modals/SettingsModal';

const STORAGE_CONVOS = 'localiq_conversations_v1';
const STORAGE_HARDWARE = 'localiq_hardware_v1';

// Seed conversations as required by prompt
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

export function App() {
  const [currentView, setCurrentView] = useState<'chat' | 'advanced' | 'report'>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Hardware State
  const [hardware, setHardware] = useState<UserHardwareProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_HARDWARE);
      if (saved) return JSON.parse(saved);
    } catch {
      // Fallback
    }
    return DEFAULT_HARDWARE_PROFILE;
  });

  // Model & Advanced Settings State
  const [selectedModel, setSelectedModel] = useState<AIModelSpec>(POPULAR_MODELS[0]); // Qwen 2.5 Coder 7B
  const [quantization, setQuantization] = useState<QuantizationType>('Q4_K_M');
  const [contextLength, setContextLength] = useState<number>(8192);
  const [batchSize, setBatchSize] = useState<number>(1);
  const [runtime, setRuntime] = useState<string>('Ollama');

  // Modals
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Conversations State
  const [conversations, setConversations] = useState<ChatConversation[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CONVOS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback
    }
    return INITIAL_CONVERSATIONS;
  });

  const [activeConversationId, setActiveConversationId] = useState<string>(
    INITIAL_CONVERSATIONS[0].id
  );

  const [isLoadingAdvisor, setIsLoadingAdvisor] = useState(false);

  // Sync to localStorage
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

  // Active conversation object
  const activeConversation =
    conversations.find(c => c.id === activeConversationId) || conversations[0];
  const messages = activeConversation?.messages || [];
  const hasMessages = messages.length > 0;

  // New Chat Handler
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

  // Delete Conversation
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

  // Send Message in Chat
  const handleSendMessage = (text: string) => {
    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: Date.now()
    };

    // Update conversation with user message
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

    // Simulate conversational intelligence step
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
    <div className="flex h-screen w-screen overflow-hidden bg-[#121615] text-[#e4ece7]">
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
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        <TopToolbar
          currentView={currentView}
          onNavigate={view => setCurrentView(view)}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
          onOpenHardwareModal={() => setIsHardwareModalOpen(true)}
        />

        {/* Dynamic View Router */}
        {currentView === 'chat' && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
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
          </div>
        )}

        {currentView === 'advanced' && (
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
        )}

        {currentView === 'report' && (
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
        )}
      </div>

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

export default App;
