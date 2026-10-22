import React, { useState } from 'react';
import { Box, HelpCircle, Layers } from 'lucide-react';
import { AIModelSpec, QuantizationType } from '../../types/models';
import { POPULAR_MODELS, QUANTIZATION_OPTIONS } from '../../services/modelDatabase';

interface ModelSelectorProps {
  selectedModel: AIModelSpec;
  onSelectModel: (model: AIModelSpec) => void;
  quantization: QuantizationType;
  onChangeQuantization: (q: QuantizationType) => void;
  contextLength: number;
  onChangeContextLength: (ctx: number) => void;
  batchSize: number;
  onChangeBatchSize: (batch: number) => void;
  runtime: string;
  onChangeRuntime: (runtime: any) => void;
}

const CONTEXT_LENGTH_OPTIONS = [2048, 4096, 8192, 16384, 32768, 65536, 131072];
const RUNTIME_OPTIONS = ['Ollama', 'LM Studio', 'vLLM', 'llama.cpp', 'ExLlamaV2'];

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onSelectModel,
  quantization,
  onChangeQuantization,
  contextLength,
  onChangeContextLength,
  batchSize,
  onChangeBatchSize,
  runtime,
  onChangeRuntime
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="bg-[#181e1c] border border-[#27322e] rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-[#242e2a] pb-3">
        <div className="flex items-center gap-2">
          <Box size={16} className="text-[#75a691]" />
          <h2 className="text-sm font-semibold text-[#e4ece7]">Model & Runtime Parameters</h2>
        </div>
        <span className="text-xs text-[#6e8579] font-mono">Inference Settings</span>
      </div>

      {/* Model Selector Cards */}
      <div>
        <label className="block text-xs font-medium text-[#96a99e] mb-1.5">
          Select AI Model
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {POPULAR_MODELS.map(m => {
            const isSelected = m.id === selectedModel.id;
            return (
              <button
                type="button"
                key={m.id}
                onClick={() => onSelectModel(m)}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  isSelected
                    ? 'bg-[#22312a] border-[#3e5f4e] shadow-sm'
                    : 'bg-[#131716] border-[#25302c] hover:border-[#384a42] text-[#96a99e]'
                }`}
              >
                <div className="text-xs font-semibold text-[#e4ece7] truncate">{m.name}</div>
                <div className="text-[10.5px] font-mono text-[#75a691] mt-0.5">
                  {m.displayParameters}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quantization Selector with Tooltip */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-[#96a99e]">
              Quantization Precision
            </label>
            <div className="relative inline-block">
              <button
                type="button"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onClick={() => setShowTooltip(prev => !prev)}
                className="text-[#6e8579] hover:text-[#96a99e]"
                title="What is quantization?"
              >
                <HelpCircle size={13} />
              </button>

              {showTooltip && (
                <div className="absolute left-0 bottom-full mb-1.5 w-64 p-2.5 bg-[#1e2523] border border-[#3b4e45] text-[11px] text-[#c4d5cc] rounded-lg shadow-2xl z-40 leading-relaxed pointer-events-none">
                  <strong className="text-[#e4ece7] block mb-0.5">Quantization explained:</strong>
                  Reduces model memory requirements by storing neural network weights at lower bit precision (e.g. 4-bit instead of 16-bit), saving up to 70% VRAM with minimal quality loss.
                </div>
              )}
            </div>
          </div>
          <span className="text-[11px] text-[#75a691] font-mono">Q4_K_M Recommended</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {QUANTIZATION_OPTIONS.map(q => {
            const isSelected = q.type === quantization;
            return (
              <button
                type="button"
                key={q.type}
                onClick={() => onChangeQuantization(q.type)}
                className={`px-2 py-1.5 rounded-lg border text-center transition-all ${
                  isSelected
                    ? 'bg-[#22312a] border-[#3e5f4e] text-[#7be0a4] font-medium'
                    : 'bg-[#131716] border-[#25302c] text-[#8ea196] hover:text-[#e4ece7] hover:border-[#384a42]'
                }`}
              >
                <div className="text-xs font-mono">{q.type}</div>
                <div className="text-[10px] text-[#55695f]">{q.bitsPerWeight} bits/w</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Context Length, Batch Size, and Runtime Engine */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        {/* Context Length */}
        <div>
          <label className="block text-xs font-medium text-[#96a99e] mb-1">
            Context Window (Tokens)
          </label>
          <select
            value={contextLength}
            onChange={e => onChangeContextLength(Number(e.target.value))}
            className="w-full bg-[#131716] border border-[#2e3b35] focus:border-[#4d6b5c] px-2.5 py-1.5 rounded-lg text-xs font-mono text-[#e4ece7] focus:outline-none"
          >
            {CONTEXT_LENGTH_OPTIONS.map(ctx => (
              <option key={ctx} value={ctx}>
                {ctx.toLocaleString()} tokens ({Math.round(ctx / 1024)}k)
              </option>
            ))}
          </select>
        </div>

        {/* Batch Size */}
        <div>
          <label className="block text-xs font-medium text-[#96a99e] mb-1">
            Concurrent Batch Size
          </label>
          <select
            value={batchSize}
            onChange={e => onChangeBatchSize(Number(e.target.value))}
            className="w-full bg-[#131716] border border-[#2e3b35] focus:border-[#4d6b5c] px-2.5 py-1.5 rounded-lg text-xs font-mono text-[#e4ece7] focus:outline-none"
          >
            {[1, 2, 4, 8].map(b => (
              <option key={b} value={b}>
                {b} {b === 1 ? 'sequence (Single User)' : 'sequences'}
              </option>
            ))}
          </select>
        </div>

        {/* Runtime Engine */}
        <div>
          <label className="block text-xs font-medium text-[#96a99e] mb-1">
            Inference Engine Runtime
          </label>
          <select
            value={runtime}
            onChange={e => onChangeRuntime(e.target.value)}
            className="w-full bg-[#131716] border border-[#2e3b35] focus:border-[#4d6b5c] px-2.5 py-1.5 rounded-lg text-xs font-mono text-[#e4ece7] focus:outline-none"
          >
            {RUNTIME_OPTIONS.map(r => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
