import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Code2, ShieldAlert } from 'lucide-react';
import { AIModelSpec, QuantizationType } from '../../types/models';
import { MemoryCalculationResult, UserHardwareProfile } from '../../types/hardware';

interface TechnicalBreakdownProps {
  model: AIModelSpec;
  quantization: QuantizationType;
  contextLength: number;
  batchSize: number;
  calcResult: MemoryCalculationResult;
  hardware: UserHardwareProfile;
}

export const TechnicalBreakdown: React.FC<TechnicalBreakdownProps> = ({
  model,
  quantization,
  contextLength,
  batchSize,
  calcResult,
  hardware
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-[#181e1c] border border-[#27322e] rounded-xl overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-[#1c2421] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Code2 size={16} className="text-[#75a691]" />
          <h3 className="text-xs sm:text-sm font-semibold text-[#e4ece7]">
            Technical Calculation Breakdown & Assumptions
          </h3>
          <span className="text-[10px] text-[#71877b] bg-[#141b18] border border-[#242e2a] px-2 py-0.5 rounded font-mono">
            {isOpen ? 'Click to Collapse' : 'Expand Details'}
          </span>
        </div>

        {isOpen ? (
          <ChevronUp size={16} className="text-[#71877b]" />
        ) : (
          <ChevronDown size={16} className="text-[#71877b]" />
        )}
      </button>

      {isOpen && (
        <div className="p-4 sm:p-5 pt-0 border-t border-[#222c28] space-y-4 text-xs text-[#96a99e] bg-[#151c19]/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Weight Math */}
            <div className="bg-[#121615] border border-[#242e2a] rounded-lg p-3 space-y-1.5 font-mono text-[11px]">
              <div className="text-[#75a691] font-semibold font-sans text-xs">
                1. Model Weights Footprint
              </div>
              <div className="text-[#e4ece7]">
                Formula: (P &times; 10⁹ &times; b / 8) / 1024³ &times; 1.05
              </div>
              <div className="text-[#8a9f94]">
                • Parameters (P): {model.parameterCountBillions} Billion
                <br />
                • Quantization: {quantization} (~4.5 bits per weight)
                <br />
                • Calculated Weight Footprint: <strong className="text-[#e4ece7]">{calcResult.modelWeightsGB} GB</strong>
              </div>
            </div>

            {/* KV Cache Math */}
            <div className="bg-[#121615] border border-[#242e2a] rounded-lg p-3 space-y-1.5 font-mono text-[11px]">
              <div className="text-[#3a727d] font-semibold font-sans text-xs">
                2. Key-Value (KV) Cache Math
              </div>
              <div className="text-[#e4ece7]">
                Formula: 2 &times; Batch &times; Context &times; Layers &times; Heads &times; Dim &times; 2
              </div>
              <div className="text-[#8a9f94]">
                • Context Window: {contextLength.toLocaleString()} tokens
                <br />
                • Concurrency Batch Size: {batchSize}
                <br />
                • Calculated KV Cache: <strong className="text-[#e4ece7]">{calcResult.kvCacheGB} GB</strong>
              </div>
            </div>
          </div>

          {/* Runtime Context & Limitations */}
          <div className="bg-[#121615] border border-[#242e2a] rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#e4ece7]">
              <ShieldAlert size={14} className="text-[#f5cf6d]" />
              <span>Assumptions & Calculation Boundaries</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[#8a9f94] text-[11.5px] leading-relaxed">
              <li>
                <strong>CUDA / Metal Runtime Context:</strong> Allocates an estimated ~0.65GB for GPU driver context, memory fragmentation margins, and inference runtime buffers.
              </li>
              <li>
                <strong>Theoretical vs. Empirical:</strong> This model provides mathematical bounds based on architecture tensors. Actual runtime consumption may vary slightly across Ollama, LM Studio, vLLM, or llama.cpp builds.
              </li>
              <li>
                <strong>Host System RAM:</strong> Configured for {hardware.systemRamGB}GB total RAM ({hardware.occupiedRamGB}GB occupied). System offloading will automatically trigger if model weights exceed {hardware.gpu.vramGB}GB VRAM.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
