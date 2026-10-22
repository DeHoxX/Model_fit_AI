import React, { useState } from 'react';
import {
  MessageSquarePlus,
  Search,
  Cpu,
  BookmarkCheck,
  Settings,
  X,
  Trash2,
  Sliders,
  ChevronLeft
} from 'lucide-react';
import { ChatConversation } from '../../types/chat';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: ChatConversation[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onOpenHardwareModal: () => void;
  onOpenSettingsModal: () => void;
  onNavigateToAdvanced: () => void;
  onNavigateToReport: () => void;
  hasSavedReport: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onOpenHardwareModal,
  onOpenSettingsModal,
  onNavigateToAdvanced,
  onNavigateToReport,
  hasSavedReport
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = conversations.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30 transition-opacity"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 flex flex-col bg-[#0e1211] border-r border-[#202925] w-64 md:w-64 transition-all duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:-ml-64'
        }`}
      >
        {/* Brand & New Chat */}
        <div className="p-3.5 border-b border-[#1d2622]">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#22332a] border border-[#3b5246] flex items-center justify-center text-[#75a691]">
                <Cpu size={16} />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#e4ece7] tracking-tight">
                  LocalIQ
                </span>
                <span className="text-[10px] text-[#617369] uppercase font-mono tracking-wider -mt-0.5">
                  AI Hardware Advisor
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1 text-[#617369] hover:text-[#96a99e] rounded-md hover:bg-[#18201d]"
              title="Close sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={onNewChat}
            className="w-full flex items-center justify-center gap-2 text-xs font-medium text-[#e4ece7] bg-[#1a2420] hover:bg-[#23312c] border border-[#2c3d35] hover:border-[#3d5349] py-2 px-3 rounded-lg transition-colors shadow-sm"
            id="sidebar-new-chat-btn"
          >
            <MessageSquarePlus size={15} className="text-[#8eb4a1]" />
            <span>New Chat</span>
          </button>

          {/* Search box */}
          <div className="mt-2.5 relative flex items-center">
            <Search size={13} className="absolute left-2.5 text-[#52635a]" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#141b18] border border-[#202925] rounded-md pl-8 pr-7 py-1 text-xs text-[#e4ece7] placeholder-[#52635a] focus:border-[#384c42] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-[#52635a] hover:text-[#96a99e]"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-[#52635a]">
            Recent Inquiries
          </div>

          {filteredConversations.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[#52635a]">
              No conversations found
            </div>
          ) : (
            filteredConversations.map(conv => {
              const isActive = conv.id === activeConversationId;
              return (
                <div
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`group relative flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-[#1b2521] text-[#e4ece7] font-medium border border-[#2e4037]'
                      : 'text-[#96a99e] hover:bg-[#151c19] hover:text-[#e4ece7] border border-transparent'
                  }`}
                >
                  <span className="truncate pr-4">{conv.title}</span>

                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-[#617369] hover:text-[#f87171] rounded transition-opacity"
                    title="Delete conversation"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Utility Navigation */}
        <div className="p-2 border-t border-[#1d2622] space-y-0.5 bg-[#0e1211]">
          <button
            type="button"
            onClick={onNavigateToAdvanced}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs text-[#96a99e] hover:text-[#e4ece7] hover:bg-[#161e1b] rounded-md transition-colors"
          >
            <Sliders size={14} className="text-[#6d8a7c]" />
            <span>Advanced Configuration</span>
          </button>

          <button
            type="button"
            onClick={onOpenHardwareModal}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs text-[#96a99e] hover:text-[#e4ece7] hover:bg-[#161e1b] rounded-md transition-colors"
          >
            <Cpu size={14} className="text-[#6d8a7c]" />
            <span>My Hardware Profile</span>
          </button>

          {hasSavedReport && (
            <button
              type="button"
              onClick={onNavigateToReport}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs text-[#96a99e] hover:text-[#e4ece7] hover:bg-[#161e1b] rounded-md transition-colors"
            >
              <BookmarkCheck size={14} className="text-[#75a691]" />
              <span>Latest Recommendation</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSettingsModal}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs text-[#96a99e] hover:text-[#e4ece7] hover:bg-[#161e1b] rounded-md transition-colors"
          >
            <Settings size={14} className="text-[#6d8a7c]" />
            <span>Settings</span>
          </button>
        </div>
      </aside>
    </>
  );
};
