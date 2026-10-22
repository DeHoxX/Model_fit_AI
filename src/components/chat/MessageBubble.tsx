import React from 'react';
import { Cpu, ArrowRight, CheckCircle2, User } from 'lucide-react';
import { ChatMessage, QuickReplyOption } from '../../types/chat';

interface MessageBubbleProps {
  message: ChatMessage;
  onSelectQuickReply: (option: QuickReplyOption) => void;
  onViewReport: () => void;
  onViewAdvanced: () => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onSelectQuickReply,
  onViewReport,
  onViewAdvanced
}) => {
  const isUser = message.sender === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-5">
        <div className="flex items-start gap-2.5 max-w-[85%] sm:max-w-[75%]">
          <div className="bg-[#2d3e36] border border-[#3e554a] text-[#e8f2ec] px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed shadow-sm">
            {message.text}
          </div>
          <div className="w-7 h-7 rounded-full bg-[#3d2e28] border border-[#5a4238] flex items-center justify-center text-[#c99587] flex-shrink-0 text-xs">
            <User size={14} />
          </div>
        </div>
      </div>
    );
  }

  // Assistant Message
  return (
    <div className="flex justify-start mb-6">
      <div className="flex items-start gap-3 max-w-2xl w-full">
        {/* Assistant Avatar matching Concept A/B */}
        <div className="w-8 h-8 rounded-full bg-[#1e2723] border border-[#33443d] flex items-center justify-center text-[#75a691] flex-shrink-0 mt-0.5">
          <Cpu size={15} />
        </div>

        <div className="flex-1 space-y-3">
          {/* Main Bubble Card */}
          <div className="bg-[#181e1c] border border-[#27322e] text-[#e4ece7] p-4 rounded-2xl rounded-tl-sm text-sm leading-relaxed shadow-sm">
            <div className="whitespace-pre-line">
              {message.text.split('\n').map((paragraph, idx) => {
                if (paragraph.startsWith('• ')) {
                  const parts = paragraph.replace('• ', '').split(':');
                  return (
                    <div key={idx} className="flex items-start gap-2 my-1 pl-1">
                      <span className="text-[#648d7d] font-bold">•</span>
                      <span>
                        <strong className="text-[#8eb4a1]">{parts[0]}:</strong>
                        {parts.slice(1).join(':')}
                      </span>
                    </div>
                  );
                }
                return (
                  <p key={idx} className={idx > 0 ? 'mt-2' : ''}>
                    {paragraph}
                  </p>
                );
              })}
            </div>

            {/* Recommendation Preview Card (if present) */}
            {message.recommendationPreview && (
              <div className="mt-4 pt-3.5 border-t border-[#25302c] bg-[#141a18] p-3.5 rounded-xl border border-[#232f2a]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#75a691]" />
                    <span className="font-semibold text-sm text-[#e4ece7]">
                      {message.recommendationPreview.model.name}
                    </span>
                    <span className="text-xs text-[#6e8579] font-mono">
                      {message.recommendationPreview.model.displayParameters}
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#7be0a4] bg-[#1d3327] border border-[#2c533e] px-2 py-0.5 rounded-full">
                    <CheckCircle2 size={11} />
                    <span>Highly Compatible</span>
                  </span>
                </div>

                {/* Mini Memory Allocation Bar matching Concept B in screenshot */}
                <div className="my-2.5">
                  <div className="flex justify-between text-[11px] font-mono text-[#82998d] mb-1">
                    <span>Memory Allocation (12GB VRAM)</span>
                    <span>
                      {message.recommendationPreview.calcResult.totalRequiredVramGB}GB /{' '}
                      {message.recommendationPreview.calcResult.availableVramGB}GB
                    </span>
                  </div>

                  <div className="h-2.5 w-full bg-[#18231f] rounded-full overflow-hidden flex border border-[#273730]">
                    <div
                      style={{
                        width: `${Math.min(
                          100,
                          (message.recommendationPreview.calcResult.modelWeightsGB /
                            message.recommendationPreview.calcResult.availableVramGB) *
                            100
                        )}%`
                      }}
                      className="bg-[#5a826e] h-full"
                      title="Model Weights"
                    />
                    <div
                      style={{
                        width: `${Math.min(
                          100,
                          (message.recommendationPreview.calcResult.kvCacheGB /
                            message.recommendationPreview.calcResult.availableVramGB) *
                            100
                        )}%`
                      }}
                      className="bg-[#3a727d] h-full"
                      title="KV Cache"
                    />
                    <div className="flex-1 bg-[#25332c] h-full" title="Headroom" />
                  </div>

                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[#71877b]">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#5a826e]" /> Model weight (
                      {message.recommendationPreview.calcResult.modelWeightsGB}GB)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#3a727d]" /> KV cache (
                      {message.recommendationPreview.calcResult.kvCacheGB}GB)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#25332c]" /> Free headroom
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2 flex items-center justify-between">
                  <span className="text-xs text-[#8a9f94]">
                    Zero system RAM offload needed • Full GPU acceleration
                  </span>
                  <button
                    type="button"
                    onClick={onViewReport}
                    className="flex items-center gap-1.5 text-xs font-medium text-[#f0f6f2] bg-[#2e473b] hover:bg-[#3d5e4f] border border-[#486b59] px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                  >
                    <span>View Full Report</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Reply Choices matching Concept A/B */}
          {message.quickReplies && message.quickReplies.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1 pl-1">
              {message.quickReplies.map(reply => {
                const isReportAction = reply.actionValue === 'ACTION_VIEW_REPORT';
                const isAdvancedAction = reply.actionValue === 'ACTION_VIEW_ADVANCED';

                return (
                  <button
                    type="button"
                    key={reply.id}
                    onClick={() => {
                      if (isReportAction) {
                        onViewReport();
                      } else if (isAdvancedAction) {
                        onViewAdvanced();
                      } else {
                        onSelectQuickReply(reply);
                      }
                    }}
                    className={`text-xs px-3 py-1.5 rounded-xl border transition-all ${
                      isReportAction
                        ? 'bg-[#293d33] hover:bg-[#354f42] text-[#e4ece7] border-[#446654] font-medium shadow-sm'
                        : isAdvancedAction
                        ? 'bg-[#1e2723] hover:bg-[#27332e] text-[#96a99e] border-[#2c3d35]'
                        : 'bg-[#202925] hover:bg-[#2b3731] text-[#c4d5cc] hover:text-[#e4ece7] border-[#32403a] hover:border-[#465951]'
                    }`}
                  >
                    {reply.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
