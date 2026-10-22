import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Sliders,
  MessageSquare,
  BookmarkCheck,
  Share2,
  Download,
  Terminal,
  Cpu,
  Check
} from 'lucide-react';
import { AIModelSpec, QuantizationType } from '../../types/models';
import { UserHardwareProfile } from '../../types/hardware';
import { calculateMemoryRequirements } from '../../services/calculationEngine';
import { POPULAR_MODELS } from '../../services/modelDatabase';
import { ModelComparisonTable } from './ModelComparisonTable';
import { TechnicalBreakdown } from './TechnicalBreakdown';

interface RecommendationReportProps {
  model: AIModelSpec;
  hardware: UserHardwareProfile;
  quantization: QuantizationType;
  contextLength: number;
  batchSize: number;
  onBackToChat: () => void;
  onOpenAdvanced: () => void;
  onSelectAlternative: (alt: AIModelSpec) => void;
}

export const RecommendationReport: React.FC<RecommendationReportProps> = ({
  model,
  hardware,
  quantization,
  contextLength,
  batchSize,
  onBackToChat,
  onOpenAdvanced,
  onSelectAlternative
}) => {
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const calcResult = calculateMemoryRequirements(
    model,
    quantization,
    contextLength,
    batchSize,
    hardware
  );

  // Bar allocations matching Concept B
  const totalBarCapacity = Math.max(calcResult.availableVramGB, calcResult.totalRequiredVramGB);
  const weightPercent = Math.min(100, (calcResult.modelWeightsGB / totalBarCapacity) * 100);
  const kvPercent = Math.min(100 - weightPercent, (calcResult.kvCacheGB / totalBarCapacity) * 100);
  const headroomPercent = Math.max(0, 100 - weightPercent - kvPercent);

  const ollamaCommand = `ollama run ${model.id === 'qwen-2.5-coder-7b' ? 'qwen2.5-coder:7b' : model.id}`;

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(ollamaCommand);
    setCopiedInstall(true);
    setTimeout(() => setCopiedInstall(false), 2000);
  };

  const handleSaveReport = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 max-w-4xl mx-auto w-full space-y-6">
      {/* Top Breadcrumb & Return Nav */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#242e2a] pb-4">
        <div>
          <button
            type="button"
            onClick={onBackToChat}
            className="flex items-center gap-1.5 text-xs text-[#8a9f94] hover:text-[#e4ece7] mb-1.5 transition-colors"
          >
            <ArrowLeft size={13} />
            <span>Return to Conversational Advisor</span>
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-[#e4ece7] tracking-tight flex items-center gap-2">
            <span>Hardware Compatibility Report</span>
            <span className="text-xs font-mono font-normal text-[#75a691] bg-[#1a2b23] border border-[#2e473b] px-2 py-0.5 rounded-full">
              Verified
            </span>
          </h1>
          <p className="text-xs text-[#8a9f94] mt-0.5">
            Deterministic VRAM & parameter compatibility for your {hardware.gpu.name}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveReport}
            className="flex items-center gap-1.5 text-xs font-medium text-[#c4d5cc] bg-[#1a2320] hover:bg-[#23312c] border border-[#2d3f37] px-3 py-1.5 rounded-lg transition-colors"
          >
            <BookmarkCheck size={13} className="text-[#75a691]" />
            <span>{savedNotice ? 'Report Saved!' : 'Save Report'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenAdvanced}
            className="flex items-center gap-1.5 text-xs font-medium text-[#e4ece7] bg-[#24352d] hover:bg-[#31483d] border border-[#3e5b4c] px-3 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            <Sliders size={13} className="text-[#8eb4a1]" />
            <span>Open in Advanced Estimator</span>
          </button>
        </div>
      </div>

      {/* Hero Recommendation Card */}
      <div className="bg-[#181e1c] border border-[#2d3f37] rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#75a691] font-semibold">
                Primary Recommended Model
              </span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#75a691]" />
              <span className="text-xs text-[#8a9f94]">{model.family} Architecture</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-[#e4ece7] mt-1">
              {model.name}
            </h2>
            <p className="text-xs text-[#8eb4a1] mt-0.5">
              {model.displayParameters} &bull; Recommended Quantization: <strong className="text-[#e4ece7]">{quantization}</strong>
            </p>
          </div>

          {/* Compatibility Badge */}
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7be0a4] bg-[#1a3326] border border-[#2a563e] px-3 py-1 rounded-full self-start">
            <CheckCircle2 size={13} />
            <span>{calcResult.statusLabel}</span>
          </span>
        </div>

        {/* Why this model */}
        <div className="bg-[#131716] border border-[#242e2a] rounded-lg p-3.5 text-xs text-[#c4d5cc] leading-relaxed">
          <strong className="text-[#e4ece7] block mb-1">Why this fits your workflow:</strong>
          {model.description} {model.recommendedFor}
        </div>

        {/* Horizontal Memory Allocation Bar (Matching Concept B screenshot) */}
        <div className="space-y-2 pt-1">
          <div className="flex justify-between items-baseline text-xs font-mono">
            <span className="text-[#96a99e] font-sans font-medium">Memory Allocation Bar</span>
            <span className="text-[#e4ece7]">
              <strong>{calcResult.totalRequiredVramGB}GB</strong> required &bull;{' '}
              <strong className="text-[#75a691]">{hardware.gpu.vramGB}GB VRAM ({calcResult.headroomGB}GB Free)</strong>
            </span>
          </div>

          <div className="h-6 w-full bg-[#121615] rounded-lg overflow-hidden flex border border-[#2b3a32] p-0.5">
            <div
              style={{ width: `${weightPercent}%` }}
              className="h-full bg-[#5a826e] rounded-l flex items-center justify-center text-[10.5px] font-mono text-white font-medium truncate px-1"
            >
              Weights: {calcResult.modelWeightsGB}GB
            </div>
            <div
              style={{ width: `${kvPercent}%` }}
              className="h-full bg-[#3a727d] flex items-center justify-center text-[10.5px] font-mono text-white font-medium truncate px-1"
            >
              KV: {calcResult.kvCacheGB}GB
            </div>
            {headroomPercent > 0 && (
              <div
                style={{ width: `${headroomPercent}%` }}
                className="h-full bg-[#24332b] rounded-r flex items-center justify-center text-[10.5px] font-mono text-[#8a9f94] truncate px-1"
              >
                Free: +{calcResult.headroomGB}GB
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-[#8a9f94]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#5a826e]" /> Model weight ({calcResult.modelWeightsGB}GB)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#3a727d]" /> KV cache ({calcResult.kvCacheGB}GB)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#24332b]" /> Free Headroom (+{calcResult.headroomGB}GB)
            </span>
          </div>
        </div>

        {/* One-Click Run Terminal Command */}
        <div className="bg-[#121615] border border-[#232d28] rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 font-mono text-xs text-[#8eb4a1]">
            <Terminal size={14} className="text-[#75a691] flex-shrink-0" />
            <span className="text-[#6e8579] select-none">$</span>
            <span className="text-[#e4ece7] select-all">{ollamaCommand}</span>
          </div>

          <button
            type="button"
            onClick={handleCopyCommand}
            className="flex items-center gap-1.5 text-xs text-[#96a99e] hover:text-[#e4ece7] bg-[#1a2320] hover:bg-[#23312c] border border-[#2c3d35] px-2.5 py-1 rounded transition-colors self-start sm:self-auto"
          >
            {copiedInstall ? (
              <>
                <Check size={12} className="text-[#7be0a4]" />
                <span className="text-[#7be0a4]">Copied Command</span>
              </>
            ) : (
              <span>Copy Ollama Command</span>
            )}
          </button>
        </div>
      </div>

      {/* Model Alternatives Table */}
      <ModelComparisonTable
        primaryModel={model}
        hardware={hardware}
        alternativeModels={POPULAR_MODELS}
        onSelectAlternative={onSelectAlternative}
      />

      {/* Expandable Technical Math Breakdown */}
      <TechnicalBreakdown
        model={model}
        quantization={quantization}
        contextLength={contextLength}
        batchSize={batchSize}
        calcResult={calcResult}
        hardware={hardware}
      />

      {/* Action Footer Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBackToChat}
          className="flex items-center gap-2 text-xs font-medium text-[#e4ece7] bg-[#181e1c] hover:bg-[#222b27] border border-[#27322e] px-4 py-2 rounded-lg transition-colors"
        >
          <MessageSquare size={14} className="text-[#75a691]" />
          <span>Ask a Follow-Up in Chat</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenAdvanced}
            className="flex items-center gap-2 text-xs font-medium text-[#e4ece7] bg-[#24352d] hover:bg-[#31483d] border border-[#3e5b4c] px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            <Sliders size={14} className="text-[#8eb4a1]" />
            <span>Customize Parameters in Advanced Config</span>
          </button>
        </div>
      </div>
    </div>
  );
};
