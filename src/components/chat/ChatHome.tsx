import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { ArrowUp, Sparkles, Terminal, Cpu, Scale } from 'lucide-react';

interface ChatHomeProps {
  onSendMessage: (text: string) => void;
}

const SUGGESTED_PROMPTS = [
  {
    id: 'prompt-1',
    label: 'Find a local AI model for coding',
    icon: Terminal,
    text: 'I want to run an AI model locally for Python and web development coding.'
  },
  {
    id: 'prompt-2',
    label: 'Can my computer run a specific AI model?',
    icon: Cpu,
    text: 'Can my computer run Llama 3.1 8B or Qwen 2.5 Coder locally?'
  },
  {
    id: 'prompt-3',
    label: 'Help me choose a model for my GPU',
    icon: Sparkles,
    text: 'Help me choose the most powerful AI model that fits my GPU VRAM.'
  },
  {
    id: 'prompt-4',
    label: 'Compare local AI and cloud AI',
    icon: Scale,
    text: 'What are the trade-offs between running models locally versus using cloud AI APIs?'
  }
];

export const ChatHome: React.FC<ChatHomeProps> = ({ onSendMessage }) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    onSendMessage(clean);
    setText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 max-w-2xl mx-auto w-full -mt-10 animate-fade-in">
      {/* Editorial Headline */}
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#e4ece7] tracking-tight mb-2.5">
          What do you want to run on your computer?
        </h1>
        <p className="text-sm text-[#8a9f94] max-w-lg mx-auto leading-relaxed">
          Tell me what you want to do with AI. I'll help you find a model that fits your hardware.
        </p>
      </div>

      {/* Primary Input Container matching screenshot */}
      <div className="w-full">
        <form
          onSubmit={handleSubmit}
          className="relative bg-[#171f1c] border border-[#2d3d36] hover:border-[#3d5349] focus-within:border-[#4d6b5c] rounded-2xl p-3 shadow-lg shadow-black/20 transition-all"
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about local AI models or your hardware..."
            className="w-full bg-transparent text-[#e4ece7] placeholder-[#617369] text-sm resize-none focus:outline-none pr-12 min-h-[44px] max-h-[180px] leading-relaxed"
            id="chat-home-textarea"
          />

          <div className="flex items-center justify-between pt-2 border-t border-[#222c28] mt-1">
            <span className="text-[11px] text-[#55695f] font-mono">
              Press <kbd className="bg-[#1f2824] px-1.5 py-0.5 rounded text-[#8a9f94]">↵ Enter</kbd> to ask
            </span>

            <button
              type="submit"
              disabled={!text.trim()}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#334c40] hover:bg-[#416152] disabled:bg-[#1a2320] disabled:text-[#42524a] text-[#e4ece7] transition-colors"
              title="Send message"
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          </div>
        </form>

        {/* Suggested Prompt Pills */}
        <div className="mt-6 flex flex-wrap gap-2 justify-center">
          {SUGGESTED_PROMPTS.map(item => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => onSendMessage(item.text)}
                className="flex items-center gap-2 text-xs text-[#96a99e] hover:text-[#e4ece7] bg-[#181e1c] hover:bg-[#202925] border border-[#27322e] hover:border-[#384a42] px-3.5 py-2 rounded-full transition-all group shadow-sm"
              >
                <Icon size={13} className="text-[#648777] group-hover:text-[#8eb4a1] transition-colors" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
