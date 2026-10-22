import React, { useRef, useEffect } from 'react';
import { ChatMessage, QuickReplyOption } from '../../types/chat';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';

interface ConversationViewProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onSelectQuickReply: (option: QuickReplyOption) => void;
  onViewReport: () => void;
  onViewAdvanced: () => void;
  isLoading?: boolean;
}

export const ConversationView: React.FC<ConversationViewProps> = ({
  messages,
  onSendMessage,
  onSelectQuickReply,
  onViewReport,
  onViewAdvanced,
  isLoading = false
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Scrollable conversation stream */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto w-full">
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onSelectQuickReply={onSelectQuickReply}
              onViewReport={onViewReport}
              onViewAdvanced={onViewAdvanced}
            />
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-[#75a691] font-mono py-2 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-[#75a691]" />
              <span>Analyzing hardware memory footprint and token speeds...</span>
            </div>
          )}

          <div ref={bottomRef} className="h-4" />
        </div>
      </div>

      {/* Floating Bottom Composer */}
      <MessageComposer onSendMessage={onSendMessage} isLoading={isLoading} />
    </div>
  );
};
