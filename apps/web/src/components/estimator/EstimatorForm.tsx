'use client';

import React from 'react';
import {
  Sliders,
  Cpu,
  Layers,
  Database,
  Terminal,
  Zap,
  Sparkles,
  Settings2,
} from 'lucide-react';
import { paths } from '@/api/schema';

type EstimateRequestBody =
  paths['/api/v1/estimate']['post']['requestBody']['content']['application/json'];

export type Quantization = EstimateRequestBody['config']['quantization'];
export type KVDtype = EstimateRequestBody['config']['kv_cache_dtype'];
export type Runtime = EstimateRequestBody['config']['runtime'];
export type ArchitectureCategory =
  NonNullable<EstimateRequestBody['model']>['architecture_category'];
export type AttentionVariant =
  NonNullable<EstimateRequestBody['model']>['attention_variant'];


export interface EstimatorFormState {
  // Model
  id: string;
  architecture_name: string;
  architecture_category: ArchitectureCategory;
  total_params_b: number; // in billions for easy editing
  active_params_b: number;
  num_layers: number;
  hidden_size: number;
  num_attention_heads: number;
  num_kv_heads: number;
  head_dim: number | null;
  attention_variant: AttentionVariant;
  sliding_window_size: number | null;
  max_context_length: number;

  // Config
  quantization: Quantization;
  kv_cache_dtype: KVDtype;
  context_length: number;
  batch_size: number;
  runtime: Runtime;
  gpu_count: number;
  tensor_parallel_degree: number;

  // Hardware
  selected_hardware_id: string;
  custom_memory_gib: number;
  custom_reserved_gib: number;
}

export type HardwareProfile =
  paths['/api/v1/hardware']['get']['responses']['200']['content']['application/json'][number];

interface EstimatorFormProps {
  state: EstimatorFormState;
  onChange: (updates: Partial<EstimatorFormState>) => void;
  hardwareList: HardwareProfile[];
  onLoadPreset: (presetKey: string) => void;
  unit: 'GiB' | 'GB';
  onToggleUnit: () => void;
  isEstimating: boolean;
  onSubmit: () => void;
}

export const EstimatorForm: React.FC<EstimatorFormProps> = ({
  state,
  onChange,
  hardwareList,
  onLoadPreset,
  unit,
  onToggleUnit,
  isEstimating,
  onSubmit,
}) => {
  const isCustomHardware = state.selected_hardware_id === 'custom';

  return (
    <div className="bg-[#181e1c] border border-[#27322e] rounded-xl p-5 shadow-sm space-y-6">
      {/* Top Bar with Unit Switch & Presets */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#242e2a] pb-4">
        <div>
          <h2 className="text-base font-semibold text-[#e4ece7] flex items-center gap-2">
            <Settings2 size={16} className="text-[#75a691]" />
            <span>Model & Hardware Parameters</span>
          </h2>
          <p className="text-xs text-[#8a9f94] mt-0.5">
            Configure architectural and runtime parameters to run deterministic memory estimation
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Unit Toggle */}
          <div className="flex items-center bg-[#121615] border border-[#27322e] rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => unit !== 'GiB' && onToggleUnit()}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                unit === 'GiB' ? 'bg-[#273530] text-[#7be0a4]' : 'text-[#8a9f94] hover:text-[#e4ece7]'
              }`}
            >
              GiB (1024³)
            </button>
            <button
              type="button"
              onClick={() => unit !== 'GB' && onToggleUnit()}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                unit === 'GB' ? 'bg-[#273530] text-[#7be0a4]' : 'text-[#8a9f94] hover:text-[#e4ece7]'
              }`}
            >
              GB (10⁹)
            </button>
          </div>
        </div>
      </div>

      {/* Quick Test Vector Presets */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-mono uppercase text-[#73887d] tracking-wider">
          Quick Architecture Vectors
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'llama3-8b', label: 'Llama-3 8B (GQA)' },
            { id: 'llama-7b', label: 'Llama-1 7B (Dense MHA)' },
            { id: 'mistral-7b', label: 'Mistral 7B (Sliding Window)' },
            { id: 'mixtral-8x7b', label: 'Mixtral 8x7B (MoE)' },
            { id: 'falcon-7b', label: 'Falcon 7B (MQA)' },
            { id: 'smollm-135m', label: 'SmolLM-135M (Edge)' },
          ].map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => onLoadPreset(p.id)}
              className="text-xs bg-[#131917] hover:bg-[#202925] border border-[#27322e] hover:border-[#3d5349] text-[#96a99e] hover:text-[#e4ece7] px-2.5 py-1.5 rounded-lg transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Model Architecture Inputs */}
      <div className="space-y-3 pt-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-[#75a691] flex items-center gap-1.5">
          <Layers size={14} />
          <span>1. Architecture Dimensions</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1">
              Architecture Family
            </label>
            <select
              value={state.architecture_category}
              onChange={e => onChange({ architecture_category: e.target.value as ArchitectureCategory })}
              className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] focus:border-[#527a67]"
            >
              <option value="standard_transformer">Standard Transformer</option>
              <option value="moe">Mixture of Experts (MoE)</option>
              <option value="mla">Multi-Head Latent (MLA - DeepSeek)</option>
              <option value="ssm">State Space Model (SSM - Mamba)</option>
              <option value="hybrid">Hybrid SSM-Transformer</option>
              <option value="multimodal">Multimodal (Vision/Audio)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1">
              Total Parameters (Billions)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={state.total_params_b}
              onChange={e => onChange({ total_params_b: parseFloat(e.target.value) || 0 })}
              className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] font-mono focus:border-[#527a67]"
            />
          </div>

          {state.architecture_category === 'moe' && (
            <div>
              <label className="block text-xs font-medium text-[#96a99e] mb-1">
                Active Parameters (Billions)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={state.active_params_b}
                onChange={e => onChange({ active_params_b: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] font-mono focus:border-[#527a67]"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1">
              Layer Count
            </label>
            <input
              type="number"
              min="1"
              value={state.num_layers}
              onChange={e => onChange({ num_layers: parseInt(e.target.value, 10) || 0 })}
              className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] font-mono focus:border-[#527a67]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1">
              Hidden Dimension
            </label>
            <input
              type="number"
              min="64"
              value={state.hidden_size}
              onChange={e => onChange({ hidden_size: parseInt(e.target.value, 10) || 0 })}
              className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] font-mono focus:border-[#527a67]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1">
              Attention Heads (Q)
            </label>
            <input
              type="number"
              min="1"
              value={state.num_attention_heads}
              onChange={e => onChange({ num_attention_heads: parseInt(e.target.value, 10) || 0 })}
              className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] font-mono focus:border-[#527a67]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1">
              KV Heads (K/V)
            </label>
            <input
              type="number"
              min="1"
              value={state.num_kv_heads}
              onChange={e => onChange({ num_kv_heads: parseInt(e.target.value, 10) || 0 })}
              className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] font-mono focus:border-[#527a67]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1">
              Head Dimension (Optional)
            </label>
            <input
              type="number"
              placeholder="Auto (hidden / heads)"
              value={state.head_dim ?? ''}
              onChange={e =>
                onChange({
                  head_dim: e.target.value ? parseInt(e.target.value, 10) : null,
                })
              }
              className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] font-mono placeholder-[#52635a] focus:border-[#527a67]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1">
              Attention Variant
            </label>
            <select
              value={state.attention_variant}
              onChange={e => onChange({ attention_variant: e.target.value as AttentionVariant })}
              className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] focus:border-[#527a67]"
            >
              <option value="full_mha">Full Multi-Head (MHA)</option>
              <option value="grouped_query">Grouped-Query (GQA)</option>
              <option value="multi_query">Multi-Query (MQA)</option>
              <option value="sliding_window">Sliding Window (SWA)</option>
            </select>
          </div>

          {state.attention_variant === 'sliding_window' && (
            <div>
              <label className="block text-xs font-medium text-[#96a99e] mb-1">
                Sliding Window Size
              </label>
              <input
                type="number"
                min="128"
                value={state.sliding_window_size ?? 4096}
                onChange={e =>
                  onChange({ sliding_window_size: parseInt(e.target.value, 10) || null })
                }
                className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] font-mono focus:border-[#527a67]"
              />
            </div>
          )}
        </div>
      </div>

      {/* Estimation Configuration */}
      <div className="space-y-3 pt-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-[#75a691] flex items-center gap-1.5">
          <Sliders size={14} />
          <span>2. Inference Configuration</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1">
              Quantization
            </label>
            <select
              value={state.quantization}
              onChange={e => onChange({ quantization: e.target.value as Quantization })}
              className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] focus:border-[#527a67]"
            >
              <option value="q4_k_m">Q4_K_M (4.85 bpw - Balanced)</option>
              <option value="q4_0">Q4_0 (4.50 bpw - Standard 4-bit)</option>
              <option value="q4_k_s">Q4_K_S (4.50 bpw - Compact 4-bit)</option>
              <option value="q4_1">Q4_1 (5.00 bpw - 4-bit min/scale)</option>
              <option value="q5_k_m">Q5_K_M (5.50 bpw - High precision)</option>
              <option value="q8_0">Q8_0 (8.50 bpw - Near-lossless)</option>
              <option value="int8">INT8 (8.00 bpw - Standard integer)</option>
              <option value="fp16">FP16 (16.00 bpw - Half precision)</option>
              <option value="bf16">BF16 (16.00 bpw - Bfloat16)</option>
              <option value="fp32">FP32 (32.00 bpw - Full float)</option>
              <option value="awq_4bit">AWQ 4-bit (4.50 bpw)</option>
              <option value="gptq_4bit">GPTQ 4-bit (4.50 bpw)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1">
              KV Cache Dtype
            </label>
            <select
              value={state.kv_cache_dtype}
              onChange={e => onChange({ kv_cache_dtype: e.target.value as KVDtype })}
              className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] focus:border-[#527a67]"
            >
              <option value="fp16">FP16 (2 bytes / token)</option>
              <option value="bf16">BF16 (2 bytes / token)</option>
              <option value="fp8">FP8 (1 byte / token)</option>
              <option value="int8">INT8 (1 byte / token)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1">
              Runtime Framework
            </label>
            <select
              value={state.runtime}
              onChange={e => onChange({ runtime: e.target.value as Runtime })}
              className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] focus:border-[#527a67]"
            >
              <option value="llama_cpp">llama.cpp / Ollama</option>
              <option value="vllm">vLLM Engine</option>
              <option value="transformers">Hugging Face Transformers</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1">
              Batch Size
            </label>
            <input
              type="number"
              min="1"
              max="64"
              value={state.batch_size}
              onChange={e => onChange({ batch_size: parseInt(e.target.value, 10) || 1 })}
              className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] font-mono focus:border-[#527a67]"
            />
          </div>
        </div>

        {/* Context Length Slider */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-xs">
            <span className="text-[#96a99e]">Active Context Sequence Length</span>
            <span className="font-mono text-[#7be0a4]">
              {state.context_length.toLocaleString()} tokens
            </span>
          </div>
          <input
            type="range"
            min="512"
            max="65536"
            step="512"
            value={state.context_length}
            onChange={e => onChange({ context_length: parseInt(e.target.value, 10) })}
            className="w-full accent-[#5a826e] cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-[#52635a] font-mono">
            <span>512</span>
            <span>4,096</span>
            <span>8,192</span>
            <span>16,384</span>
            <span>32,768</span>
            <span>65,536</span>
          </div>
        </div>

        {/* Multi-GPU / Tensor Parallelism */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1">
              Total GPU Count
            </label>
            <input
              type="number"
              min="1"
              max="8"
              value={state.gpu_count}
              onChange={e => {
                const count = parseInt(e.target.value, 10) || 1;
                onChange({
                  gpu_count: count,
                  tensor_parallel_degree: Math.min(state.tensor_parallel_degree, count),
                });
              }}
              className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] font-mono focus:border-[#527a67]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1">
              Tensor Parallel Degree
            </label>
            <input
              type="number"
              min="1"
              max={state.gpu_count}
              value={state.tensor_parallel_degree}
              onChange={e =>
                onChange({
                  tensor_parallel_degree: Math.min(
                    parseInt(e.target.value, 10) || 1,
                    state.gpu_count
                  ),
                })
              }
              className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] font-mono focus:border-[#527a67]"
            />
          </div>
        </div>
      </div>

      {/* Hardware Profile Selector */}
      <div className="space-y-3 pt-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-[#75a691] flex items-center gap-1.5">
          <Cpu size={14} />
          <span>3. Target Hardware Target</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1">
              Hardware Profile
            </label>
            <select
              value={state.selected_hardware_id}
              onChange={e => onChange({ selected_hardware_id: e.target.value })}
              className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] focus:border-[#527a67]"
            >
              {hardwareList.map(h => (
                <option key={h.id} value={h.id}>
                  {h.name} ({(h.memory_bytes / 1024 ** 3).toFixed(0)} GiB)
                </option>
              ))}
              <option value="custom">Custom Hardware (Enter GiB)...</option>
            </select>
          </div>

          {isCustomHardware && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-[#96a99e] mb-1">
                  Total Memory (GiB)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={state.custom_memory_gib}
                  onChange={e =>
                    onChange({ custom_memory_gib: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] font-mono focus:border-[#527a67]"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-[#96a99e] mb-1">
                  Reserved (GiB)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={state.custom_reserved_gib}
                  onChange={e =>
                    onChange({ custom_reserved_gib: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-[#121615] border border-[#27322e] rounded-lg px-3 py-1.5 text-xs text-[#e4ece7] font-mono focus:border-[#527a67]"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recalculate Button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={isEstimating}
          className="w-full flex items-center justify-center gap-2 bg-[#1d2723] hover:bg-[#25332e] text-[#e4ece7] font-medium text-xs border border-[#3b4e45] py-2.5 px-4 rounded-lg transition-colors shadow-sm disabled:opacity-50"
        >
          <Zap size={14} className="text-[#7be0a4]" />
          <span>{isEstimating ? 'Calculating Memory...' : 'Re-calculate Estimation'}</span>
        </button>
      </div>
    </div>
  );
};
