import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { ArrowUp } from 'lucide-react';

interface MessageComposerProps {
  onSendMessage: (text: string) => void;
  isLoading?: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSendMessage,
  isLoading = false
}) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = text.trim();
    if (!clean || isLoading) return;
    onSendMessage(clean);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="p-4 bg-gradient-to-t from-[#121615] via-[#121615]/90 to-transparent sticky bottom-0 z-10">
      <div className="max-w-2xl mx-auto w-full">
        <form
          onSubmit={handleSubmit}
          className="relative bg-[#171f1c] border border-[#2b3a33] hover:border-[#3d5248] focus-within:border-[#4d6b5c] rounded-2xl p-2.5 shadow-lg shadow-black/30 transition-all flex items-end gap-2"
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply with your hardware, goals, or follow-up question..."
            disabled={isLoading}
            className="flex-1 bg-transparent text-[#e4ece7] placeholder-[#617369] text-sm resize-none focus:outline-none pl-2 min-h-[36px] max-h-[160px] leading-relaxed py-1"
          />

          <button
            type="submit"
            disabled={!text.trim() || isLoading}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#334c40] hover:bg-[#416152] disabled:bg-[#1a2320] disabled:text-[#42524a] text-[#e4ece7] transition-colors flex-shrink-0 mb-0.5"
            title="Send (Enter)"
          >
            {isLoading ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <ArrowUp size={16} strokeWidth={2.5} />
            )}
          </button>
        </form>

        <div className="flex justify-between items-center px-2 pt-1.5 text-[11px] text-[#55695f] font-mono">
          <span>LocalIQ Advisor &bull; Deterministic VRAM Engine</span>
          <span>Shift+↵ for newline</span>
        </div>
      </div>
    </div>
  );
};
