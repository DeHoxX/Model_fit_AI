import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  ArrowRight,
  Zap,
  Info
} from 'lucide-react';
import { MemoryCalculationResult, UserHardwareProfile } from '../../types/hardware';
import { AIModelSpec } from '../../types/models';

interface MemoryEstimatePanelProps {
  calculation: MemoryCalculationResult;
  model: AIModelSpec;
  hardware: UserHardwareProfile;
  onViewReport?: () => void;
}

export const MemoryEstimatePanel: React.FC<MemoryEstimatePanelProps> = ({
  calculation,
  model,
  hardware,
  onViewReport
}) => {
  const isOptimal = calculation.compatibilityStatus === 'optimal';
  const isAcceptable = calculation.compatibilityStatus === 'acceptable';
  const isOffload = calculation.compatibilityStatus === 'partial_offload';
  const isExceeds = calculation.compatibilityStatus === 'exceeds';

  // Percentage allocations for the visual bar (matching Concept B in screenshot)
  const totalBarCapacity = Math.max(calculation.availableVramGB, calculation.totalRequiredVramGB);
  const weightPercent = Math.min(100, (calculation.modelWeightsGB / totalBarCapacity) * 100);
  const kvPercent = Math.min(100 - weightPercent, (calculation.kvCacheGB / totalBarCapacity) * 100);
  const headroomPercent = Math.max(0, 100 - weightPercent - kvPercent);

  return (
    <div className="bg-[#181e1c] border border-[#27322e] rounded-xl p-5 shadow-sm space-y-5">
      {/* Header & Status Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#242e2a] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#75a691]" />
            <h3 className="text-base font-semibold text-[#e4ece7]">
              {model.name} Compatibility Assessment
            </h3>
          </div>
          <p className="text-xs text-[#8a9f94] mt-0.5">
            Tested on {hardware.gpu.name} ({hardware.gpu.vramGB}GB VRAM)
          </p>
        </div>

        {/* Status Pill matching screenshot badge */}
        <div>
          {isOptimal && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7be0a4] bg-[#1c3327] border border-[#2d563f] px-3 py-1 rounded-full shadow-sm">
              <CheckCircle2 size={13} />
              <span>Likely to Fit (100% VRAM)</span>
            </span>
          )}
          {isAcceptable && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#f5cf6d] bg-[#332e18] border border-[#524923] px-3 py-1 rounded-full shadow-sm">
              <AlertTriangle size={13} />
              <span>May Fit with Reduced Context</span>
            </span>
          )}
          {isOffload && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#60a5fa] bg-[#1a2b3d] border border-[#2a4563] px-3 py-1 rounded-full shadow-sm">
              <Info size={13} />
              <span>Partial GPU Offload (RAM Shared)</span>
            </span>
          )}
          {isExceeds && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#f87171] bg-[#331c1c] border border-[#542d2d] px-3 py-1 rounded-full shadow-sm">
              <AlertOctagon size={13} />
              <span>Likely to Exceed Memory</span>
            </span>
          )}
        </div>
      </div>

      {/* Primary Horizontal Allocation Bar (Matching Concept B screenshot) */}
      <div className="space-y-2">
        <div className="flex justify-between items-baseline text-xs font-mono">
          <span className="text-[#96a99e] font-sans font-medium">Memory Allocation Footprint</span>
          <span className="text-[#e4ece7]">
            <strong>{calculation.totalRequiredVramGB}GB</strong> required of{' '}
            <strong className="text-[#75a691]">{calculation.availableVramGB}GB VRAM</strong>
          </span>
        </div>

        {/* Multi-segment bar */}
        <div className="h-6 w-full bg-[#131716] rounded-lg overflow-hidden flex border border-[#2c3d35] p-0.5">
          {/* Model Weights */}
          <div
            style={{ width: `${weightPercent}%` }}
            className="h-full bg-[#5a826e] rounded-l flex items-center justify-center text-[10px] font-mono text-white font-medium truncate px-1 transition-all"
            title={`Model Weights: ${calculation.modelWeightsGB}GB`}
          >
            {weightPercent > 12 && `${calculation.modelWeightsGB}GB`}
          </div>

          {/* KV Cache */}
          <div
            style={{ width: `${kvPercent}%` }}
            className="h-full bg-[#3a727d] flex items-center justify-center text-[10px] font-mono text-white font-medium truncate px-1 transition-all"
            title={`KV Cache: ${calculation.kvCacheGB}GB`}
          >
            {kvPercent > 10 && `${calculation.kvCacheGB}GB`}
          </div>

          {/* Free Headroom */}
          {headroomPercent > 0 && !isExceeds && (
            <div
              style={{ width: `${headroomPercent}%` }}
              className="h-full bg-[#24332b] rounded-r flex items-center justify-center text-[10px] font-mono text-[#82998e] truncate px-1"
              title={`Free Headroom: ${calculation.headroomGB}GB`}
            >
              {headroomPercent > 15 && `+${calculation.headroomGB}GB Free`}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-[#8a9f94] pt-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#5a826e]" />
            <span>Model Weights ({calculation.modelWeightsGB}GB)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#3a727d]" />
            <span>KV Cache ({calculation.kvCacheGB}GB)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#24332b]" />
            <span>
              {calculation.headroomGB >= 0
                ? `Free Headroom (${calculation.headroomGB}GB)`
                : `VRAM Shortfall (${Math.abs(calculation.headroomGB)}GB)`}
            </span>
          </div>
        </div>
      </div>

      {/* 4-Metric Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
        <div className="bg-[#131716] border border-[#242e2a] rounded-lg p-3">
          <span className="text-[11px] text-[#6e8579] block">Model Weights</span>
          <span className="text-base font-semibold font-mono text-[#e4ece7]">
            {calculation.modelWeightsGB} GB
          </span>
        </div>

        <div className="bg-[#131716] border border-[#242e2a] rounded-lg p-3">
          <span className="text-[11px] text-[#6e8579] block">KV Cache Footprint</span>
          <span className="text-base font-semibold font-mono text-[#e4ece7]">
            {calculation.kvCacheGB} GB
          </span>
        </div>

        <div className="bg-[#131716] border border-[#242e2a] rounded-lg p-3">
          <span className="text-[11px] text-[#6e8579] block">Total VRAM Demanded</span>
          <span className="text-base font-semibold font-mono text-[#7be0a4]">
            {calculation.totalRequiredVramGB} GB
          </span>
        </div>

        <div className="bg-[#131716] border border-[#242e2a] rounded-lg p-3">
          <span className="text-[11px] text-[#6e8579] block">Estimated Speed</span>
          <span className="text-base font-semibold font-mono text-[#e4ece7] flex items-center gap-1">
            <Zap size={13} className="text-[#f5cf6d]" />
            ~{calculation.estimatedTokensPerSecond} tok/s
          </span>
        </div>
      </div>

      {/* Analysis & Explanatory Details */}
      <div className="bg-[#141b18] border border-[#232d29] rounded-lg p-3.5 space-y-2">
        <div className="text-xs text-[#c4d5cc] leading-relaxed">
          <strong className="text-[#e4ece7]">Compatibility Diagnosis: </strong>
          {calculation.statusExplanation}
        </div>

        {calculation.recommendedAction && (
          <div className="text-xs text-[#8eb4a1] flex items-start gap-1.5 pt-1 border-t border-[#1f2824]">
            <span className="font-semibold">&bull; Advice:</span>
            <span>{calculation.recommendedAction}</span>
          </div>
        )}
      </div>

      {/* Bottom Actions & Notice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <span className="text-[11px] text-[#55695f]">
          * Theoretical memory estimation based on model parameter count and KV cache architecture. Not an empirical benchmark.
        </span>

        {onViewReport && (
          <button
            type="button"
            onClick={onViewReport}
            className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#e4ece7] bg-[#2a4034] hover:bg-[#385545] border border-[#446653] px-4 py-2 rounded-lg transition-colors flex-shrink-0 shadow-sm"
          >
            <span>Generate Full Recommendation Report</span>
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
