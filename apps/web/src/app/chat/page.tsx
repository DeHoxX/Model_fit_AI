'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import {
  Cpu,
  Send,
  Square,
  RotateCcw,
  Sparkles,
  AlertCircle,
  ArrowRight,
  Database,
  Trash2,
  Sliders,
  Check,
} from 'lucide-react';
import { useChatStream } from '@/lib/useChatStream';
import { RecommendationCardView } from '@/components/chat/RecommendationCardView';

const QUICK_STARTERS = [
  'I have an NVIDIA RTX 4070 12GB and need a local coding model with 8k context.',
  'Can an Apple Silicon Mac with 16GB memory run Llama 3 8B at Q4 quantization?',
  'Recommend the best reasoning models that fit into an 8GB VRAM graphics card.',
];

export default function ChatPage() {
  const {
    messages,
    isStreaming,
    activeTool,
    error,
    sendMessage,
    stopStream,
    retryLast,
    clearMessages,
  } = useChatStream();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const toolDisplayMap: Record<string, string> = {
    search_models: 'Searching Hugging Face Hub catalog...',
    get_model_details: 'Inspecting safetensors headers & config...',
    recommend_models: 'Running deterministic memory ranking...',
    estimate_memory: 'Calculating memory & headroom breakdown...',
    list_hardware: 'Retrieving hardware profiles...',
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-dark-base text-slate-900 dark:text-sage-100 overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-dark-border bg-white/90 dark:bg-dark-sidebar/90 backdrop-blur z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-dark-elevated border border-emerald-200 dark:border-dark-border flex items-center justify-center text-emerald-600 dark:text-sage-400">
              <Cpu size={16} />
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight text-slate-900 dark:text-sage-100 group-hover:text-emerald-600 dark:group-hover:text-sage-300 transition-colors">
                ModelFit AI
              </div>
              <div className="text-[10px] text-slate-500 dark:text-sage-400 hidden sm:block">
                Deterministic Sizing Advisor
              </div>
            </div>
          </Link>
        </div>

        <nav className="flex items-center gap-2 sm:gap-3 text-xs">
          <Link
            href="/estimator"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-dark-surface hover:bg-slate-200 dark:hover:bg-dark-hover text-slate-700 dark:text-sage-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-dark-border transition-colors"
          >
            <Sliders size={13} />
            <span className="hidden sm:inline">Estimator</span>
          </Link>
          <Link
            href="/models"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-dark-surface hover:bg-slate-200 dark:hover:bg-dark-hover text-slate-700 dark:text-sage-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-dark-border transition-colors"
          >
            <Database size={13} />
            <span className="hidden sm:inline">Hub Catalog</span>
          </Link>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearMessages}
              disabled={isStreaming}
              title="Clear conversation"
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-dark-surface hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-500 dark:text-sage-400 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-dark-border hover:border-rose-200 dark:hover:border-rose-900 transition-colors disabled:opacity-50"
            >
              <Trash2 size={13} />
            </button>
          )}
        </nav>
      </header>

      {/* Main Conversation Stream */}
      <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 max-w-4xl mx-auto w-full space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center px-4 py-8 max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-dark-elevated border border-emerald-200 dark:border-dark-border flex items-center justify-center text-emerald-600 dark:text-sage-400 mb-4 shadow-sm">
              <Sparkles size={24} />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-sage-100 mb-2">
              ModelFit Conversational Advisor
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-sage-300 leading-relaxed mb-6">
              Ask about hardware compatibility or model sizing. All recommendations and memory
              numbers are computed by our pure deterministic engine — no LLM guesses.
            </p>

            <div className="w-full space-y-2 text-left">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-sage-400 uppercase tracking-wider px-1">
                Suggested Prompts
              </span>
              {QUICK_STARTERS.map((starter, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => sendMessage(starter)}
                  className="w-full p-3 rounded-xl bg-white dark:bg-dark-surface hover:bg-slate-50 dark:hover:bg-dark-hover border border-slate-200 dark:border-dark-border hover:border-slate-300 dark:hover:border-dark-borderActive text-xs text-slate-700 dark:text-sage-200 hover:text-slate-900 dark:hover:text-white text-left transition-all flex items-center justify-between group shadow-sm"
                >
                  <span className="line-clamp-2">{starter}</span>
                  <ArrowRight
                    size={14}
                    className="text-slate-400 dark:text-sage-400 group-hover:text-emerald-600 dark:group-hover:text-sage-300 group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[92%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-sage-700 dark:bg-dark-bubble text-white dark:text-sage-100 border border-sage-600 dark:border-dark-borderActive rounded-tr-sm'
                    : 'bg-white dark:bg-dark-surface text-slate-800 dark:text-sage-100 border border-slate-200 dark:border-dark-border rounded-tl-sm w-full'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div>
                    {/* Live Tool Execution Status */}
                    {msg.toolEvents && msg.toolEvents.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2.5 pb-2 border-b border-slate-100 dark:border-dark-border">
                        {msg.toolEvents.map((tool, idx) => (
                          <span
                            key={idx}
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                              tool.status === 'running'
                                ? 'bg-amber-50 dark:bg-dark-elevated border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 animate-pulse'
                                : 'bg-emerald-50 dark:bg-dark-elevated border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            <span>{tool.name}</span>
                            {tool.status === 'completed' && <Check size={10} />}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Markdown Body */}
                    {msg.content ? (
                      <div className="prose dark:prose-invert prose-sm max-w-none prose-p:my-1.5 prose-headings:my-2 prose-pre:bg-slate-100 dark:prose-pre:bg-dark-base prose-pre:border prose-pre:border-slate-200 dark:prose-pre:border-dark-border">
                        <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      isStreaming &&
                      msg.isStreaming && (
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-sage-400 italic py-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-sage-400 animate-ping" />
                          <span>Thinking and verifying memory constraints...</span>
                        </div>
                      )
                    )}

                    {/* Grounded Recommendation Cards */}
                    {msg.recommendations && msg.recommendations.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-slate-100 dark:border-dark-border space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                          <span>Deterministic Model Recommendations</span>
                          <span className="text-[10px] font-normal text-slate-500 dark:text-sage-400">
                            {msg.recommendations.length} candidate
                            {msg.recommendations.length > 1 ? 's' : ''} fit
                          </span>
                        </div>
                        {msg.recommendations.map(rec => (
                          <RecommendationCardView key={rec.model_id} candidate={rec} />
                        ))}
                      </div>
                    )}

                    {/* Inline Error */}
                    {msg.error && (
                      <div className="mt-2.5 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-semibold">Generation interrupted</div>
                          <div>{msg.error}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Global Active Tool pill */}
        {isStreaming && activeTool && (
          <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-dark-elevated border border-amber-300 dark:border-amber-700 px-3 py-1.5 rounded-full w-fit animate-pulse">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>{toolDisplayMap[activeTool] || `Executing ${activeTool}...`}</span>
          </div>
        )}

        {/* Global Stream Error with Retry */}
        {error && !isStreaming && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={retryLast}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 dark:bg-rose-900 dark:hover:bg-rose-800 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700 transition-colors self-start sm:self-auto"
            >
              <RotateCcw size={12} />
              <span>Retry</span>
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Message Composer & Controls */}
      <footer className="p-3 sm:p-4 border-t border-slate-200 dark:border-dark-border bg-white/95 dark:bg-dark-sidebar/95 backdrop-blur flex-shrink-0">
        <div className="max-w-4xl mx-auto w-full">
          {/* Action Bar (Stop / Retry) */}
          <div className="flex items-center justify-between mb-2 px-1 text-xs text-slate-500 dark:text-sage-400">
            <span className="hidden sm:inline text-[11px]">
              Single source of truth: pure deterministic calculation
            </span>

            <div className="flex items-center gap-2 ml-auto">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={stopStream}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs transition-colors shadow-sm"
                >
                  <Square size={12} className="fill-current" />
                  <span>Stop Generation</span>
                </button>
              ) : (
                messages.length > 0 && (
                  <button
                    type="button"
                    onClick={retryLast}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-dark-surface dark:hover:bg-dark-hover border border-slate-200 dark:border-dark-border text-slate-700 dark:text-sage-300 hover:text-slate-900 dark:hover:text-white text-[11px] transition-colors"
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
              className="w-full bg-white dark:bg-dark-surface text-slate-900 dark:text-sage-100 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-300 dark:border-dark-border focus:border-sage-500 dark:focus:border-dark-borderActive rounded-xl px-3.5 py-2.5 text-xs sm:text-sm resize-none min-h-[44px] max-h-32 transition-colors"
            />

            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              aria-label="Send message"
              className="h-[44px] w-[44px] rounded-xl bg-sage-700 hover:bg-sage-600 dark:bg-sage-800 dark:hover:bg-sage-700 border border-sage-600 dark:border-sage-700 text-white flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}
