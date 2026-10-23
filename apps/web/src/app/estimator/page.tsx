'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Cpu,
  Sliders,
  AlertCircle,
  RefreshCw,
  Calculator,
  Layers,
} from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { paths } from '@/api/schema';
import {
  EstimatorForm,
  EstimatorFormState,
  Quantization,
  KVDtype,
  Runtime,
  ArchitectureCategory,
  AttentionVariant,
} from '@/components/estimator/EstimatorForm';
import { EstimationResultCard } from '@/components/estimator/EstimationResultCard';

type HardwareProfile =
  paths['/api/v1/hardware']['get']['responses']['200']['content']['application/json'][number];

type EstimationResult =
  paths['/api/v1/estimate']['post']['responses']['200']['content']['application/json'];

const DEFAULT_FORM_STATE: EstimatorFormState = {
  id: 'llama-3-8b',
  architecture_name: 'llama',
  architecture_category: 'standard_transformer',
  total_params_b: 8.03,
  active_params_b: 8.03,
  num_layers: 32,
  hidden_size: 4096,
  num_attention_heads: 32,
  num_kv_heads: 8,
  head_dim: 128,
  attention_variant: 'grouped_query',
  sliding_window_size: null,
  max_context_length: 8192,

  quantization: 'q4_k_m',
  kv_cache_dtype: 'fp16',
  context_length: 8192,
  batch_size: 1,
  runtime: 'llama_cpp',
  gpu_count: 1,
  tensor_parallel_degree: 1,

  selected_hardware_id: '',
  custom_memory_gib: 12,
  custom_reserved_gib: 0.5,
};

const PRESET_VECTORS: Record<string, Partial<EstimatorFormState>> = {
  'llama3-8b': {
    id: 'llama-3-8b',
    architecture_name: 'llama',
    architecture_category: 'standard_transformer',
    total_params_b: 8.03,
    active_params_b: 8.03,
    num_layers: 32,
    hidden_size: 4096,
    num_attention_heads: 32,
    num_kv_heads: 8,
    head_dim: 128,
    attention_variant: 'grouped_query',
    sliding_window_size: null,
    max_context_length: 8192,
    quantization: 'q4_k_m',
    kv_cache_dtype: 'fp16',
    context_length: 8192,
    batch_size: 1,
    runtime: 'llama_cpp',
  },
  'llama-7b': {
    id: 'llama-7b',
    architecture_name: 'llama',
    architecture_category: 'standard_transformer',
    total_params_b: 6.738415616,
    active_params_b: 6.738415616,
    num_layers: 32,
    hidden_size: 4096,
    num_attention_heads: 32,
    num_kv_heads: 32,
    head_dim: 128,
    attention_variant: 'full_mha',
    sliding_window_size: null,
    max_context_length: 4096,
    quantization: 'fp16',
    kv_cache_dtype: 'fp16',
    context_length: 2048,
    batch_size: 1,
    runtime: 'llama_cpp',
  },
  'mistral-7b': {
    id: 'mistral-7b',
    architecture_name: 'mistral',
    architecture_category: 'standard_transformer',
    total_params_b: 7.24,
    active_params_b: 7.24,
    num_layers: 32,
    hidden_size: 4096,
    num_attention_heads: 32,
    num_kv_heads: 8,
    head_dim: 128,
    attention_variant: 'sliding_window',
    sliding_window_size: 4096,
    max_context_length: 32768,
    quantization: 'fp16',
    kv_cache_dtype: 'fp16',
    context_length: 32768,
    batch_size: 1,
    runtime: 'llama_cpp',
  },
  'mixtral-8x7b': {
    id: 'mixtral-8x7b',
    architecture_name: 'mixtral',
    architecture_category: 'moe',
    total_params_b: 46.7,
    active_params_b: 12.9,
    num_layers: 32,
    hidden_size: 4096,
    num_attention_heads: 32,
    num_kv_heads: 8,
    head_dim: 128,
    attention_variant: 'grouped_query',
    sliding_window_size: null,
    max_context_length: 32768,
    quantization: 'q4_0',
    kv_cache_dtype: 'fp16',
    context_length: 4096,
    batch_size: 1,
    runtime: 'llama_cpp',
  },
  'falcon-7b': {
    id: 'falcon-7b',
    architecture_name: 'falcon',
    architecture_category: 'standard_transformer',
    total_params_b: 7.0,
    active_params_b: 7.0,
    num_layers: 32,
    hidden_size: 4096,
    num_attention_heads: 64,
    num_kv_heads: 1,
    head_dim: 64,
    attention_variant: 'multi_query',
    sliding_window_size: null,
    max_context_length: 2048,
    quantization: 'int8',
    kv_cache_dtype: 'int8',
    context_length: 2048,
    batch_size: 1,
    runtime: 'llama_cpp',
  },
  'smollm-135m': {
    id: 'smollm-135m',
    architecture_name: 'llama',
    architecture_category: 'standard_transformer',
    total_params_b: 0.135,
    active_params_b: 0.135,
    num_layers: 30,
    hidden_size: 576,
    num_attention_heads: 9,
    num_kv_heads: 3,
    head_dim: 64,
    attention_variant: 'grouped_query',
    sliding_window_size: null,
    max_context_length: 2048,
    quantization: 'fp16',
    kv_cache_dtype: 'fp16',
    context_length: 2048,
    batch_size: 1,
    runtime: 'llama_cpp',
  },
};

export default function EstimatorPage() {
  const [formState, setFormState] = useState<EstimatorFormState>(DEFAULT_FORM_STATE);
  const [hardwareList, setHardwareList] = useState<HardwareProfile[]>([]);
  const [unit, setUnit] = useState<'GiB' | 'GB'>('GiB');
  const [result, setResult] = useState<EstimationResult | null>(null);

  const [isLoadingHardware, setIsLoadingHardware] = useState(true);
  const [isEstimating, setIsEstimating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<Record<string, unknown> | null>(null);

  // 1. Fetch hardware presets
  useEffect(() => {
    let mounted = true;
    async function loadHardware() {
      try {
        const data = await apiClient<HardwareProfile[]>('/api/v1/hardware');
        if (mounted) {
          setHardwareList(data);
          if (data.length > 0 && !formState.selected_hardware_id) {
            setFormState(prev => ({
              ...prev,
              selected_hardware_id: data[0].id,
            }));
          }
        }
      } catch (err) {
        if (mounted) {
          // Fallback presets if backend DB is empty or during setup
          const fallbackPresets: HardwareProfile[] = [
            {
              id: 'preset-rtx-3060',
              name: 'NVIDIA GeForce RTX 3060 12GB',
              kind: 'gpu',
              memory_bytes: 12884901888,
              reserved_memory_bytes: 536870912,
              is_verified: true,
              notes: '12 GB GDDR6 desktop GPU',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: 'preset-rtx-4090',
              name: 'NVIDIA GeForce RTX 4090',
              kind: 'gpu',
              memory_bytes: 25769803776,
              reserved_memory_bytes: 1073741824,
              is_verified: true,
              notes: '24 GB GDDR6X desktop flagship',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ];
          setHardwareList(fallbackPresets);
          setFormState(prev => ({
            ...prev,
            selected_hardware_id: fallbackPresets[0].id,
          }));
        }
      } finally {
        if (mounted) {
          setIsLoadingHardware(false);
        }
      }
    }
    loadHardware();
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Perform memory calculation
  const runEstimation = useCallback(
    async (overrideState?: EstimatorFormState) => {
      const state = overrideState || formState;
      setIsEstimating(true);
      setErrorMessage(null);
      setErrorDetails(null);

      try {
        // Resolve target hardware
        let hardwareInput: {
          name: string;
          memory_bytes: number;
          kind: 'gpu' | 'apple_unified' | 'cpu_ram';
          reserved_memory_bytes: number;
        };

        if (state.selected_hardware_id === 'custom') {
          const gib = 1024 * 1024 * 1024;
          hardwareInput = {
            name: 'Custom Hardware',
            memory_bytes: Math.round(state.custom_memory_gib * gib),
            kind: 'gpu',
            reserved_memory_bytes: Math.round(state.custom_reserved_gib * gib),
          };
        } else {
          const selected = hardwareList.find(h => h.id === state.selected_hardware_id);
          if (selected) {
            hardwareInput = {
              name: selected.name,
              memory_bytes: selected.memory_bytes,
              kind: (selected.kind as 'gpu' | 'apple_unified' | 'cpu_ram') || 'gpu',
              reserved_memory_bytes: selected.reserved_memory_bytes,
            };
          } else {
            hardwareInput = {
              name: 'NVIDIA GeForce RTX 3060 12GB',
              memory_bytes: 12884901888,
              kind: 'gpu',
              reserved_memory_bytes: 536870912,
            };
          }
        }

        const payload = {
          model: {
            id: state.id,
            architecture_name: state.architecture_name,
            architecture_category: state.architecture_category,
            total_params: Math.round(state.total_params_b * 1e9),
            active_params:
              state.architecture_category === 'moe'
                ? Math.round(state.active_params_b * 1e9)
                : Math.round(state.total_params_b * 1e9),
            num_layers: state.num_layers,
            hidden_size: state.hidden_size,
            num_attention_heads: state.num_attention_heads,
            num_kv_heads: state.num_kv_heads,
            head_dim: state.head_dim,
            attention_variant: state.attention_variant,
            sliding_window_size: state.sliding_window_size,
            max_context_length: state.max_context_length,
          },
          config: {
            quantization: state.quantization,
            kv_cache_dtype: state.kv_cache_dtype,
            context_length: state.context_length,
            batch_size: state.batch_size,
            runtime: state.runtime,
            gpu_count: state.gpu_count,
            tensor_parallel_degree: state.tensor_parallel_degree,
          },
          hardware: hardwareInput,
        };

        const res = await apiClient<EstimationResult>('/api/v1/estimate', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        setResult(res);
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          setErrorMessage(err.message);
          setErrorDetails(err.details);
        } else {
          setErrorMessage('Unable to connect to estimation service. Please verify backend is running.');
        }
      } finally {
        setIsEstimating(false);
      }
    },
    [formState, hardwareList]
  );

  // Trigger initial calculation once hardware is loaded
  useEffect(() => {
    if (hardwareList.length > 0 && !result && !isEstimating) {
      runEstimation();
    }
  }, [hardwareList, result, isEstimating, runEstimation]);

  const handleFormChange = (updates: Partial<EstimatorFormState>) => {
    const nextState = { ...formState, ...updates };
    setFormState(nextState);
  };

  const handleLoadPreset = (presetKey: string) => {
    const preset = PRESET_VECTORS[presetKey];
    if (preset) {
      const nextState = { ...formState, ...preset };
      setFormState(nextState);
      runEstimation(nextState);
    }
  };

  // Resolve total hardware memory for visualization
  const currentHardwareBytes = (() => {
    if (formState.selected_hardware_id === 'custom') {
      return formState.custom_memory_gib * 1024 ** 3;
    }
    const h = hardwareList.find(item => item.id === formState.selected_hardware_id);
    return h ? h.memory_bytes : 12884901888;
  })();

  return (
    <div className="min-h-screen bg-[#121615] text-[#e4ece7] flex flex-col">
      {/* Top Header */}
      <header className="h-14 border-b border-[#242e2a] bg-[#121615] px-4 sm:px-6 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-medium text-[#96a99e] hover:text-[#e4ece7] bg-[#181e1c] hover:bg-[#202925] border border-[#27322e] px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Back to Advisor</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium tracking-wide uppercase text-[#617369]">
              Engine Mode
            </span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#527a67]" />
            <span className="text-xs text-[#96a99e] hidden sm:inline">
              Pure Deterministic Memory Estimator
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#7be0a4] bg-[#1a2b22] border border-[#2d4d3c] px-3 py-1.5 rounded-lg">
            <Calculator size={13} />
            <span>Phase 2 Engine Active</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 overflow-y-auto">
        {/* Error Alert */}
        {errorMessage && (
          <div className="bg-[#2d1c1c] border border-[#522929] rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-[#f87171] mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-[#fca5a5]">Estimation Error</h4>
              <p className="text-xs text-[#fca5a5]/90 mt-0.5">{errorMessage}</p>
              {errorDetails && (
                <pre className="text-[11px] font-mono text-[#fca5a5]/80 bg-[#1f1313] p-2 rounded mt-2 overflow-x-auto">
                  {JSON.stringify(errorDetails, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Form Input Section */}
          <div className="lg:col-span-7 space-y-6">
            <EstimatorForm
              state={formState}
              onChange={handleFormChange}
              hardwareList={hardwareList}
              onLoadPreset={handleLoadPreset}
              unit={unit}
              onToggleUnit={() => setUnit(prev => (prev === 'GiB' ? 'GB' : 'GiB'))}
              isEstimating={isEstimating}
              onSubmit={() => runEstimation()}
            />
          </div>

          {/* Result Card Section */}
          <div className="lg:col-span-5 space-y-6">
            {isEstimating && !result && (
              <div className="bg-[#181e1c] border border-[#27322e] rounded-xl p-8 text-center space-y-3">
                <RefreshCw size={24} className="animate-spin text-[#75a691] mx-auto" />
                <p className="text-xs text-[#96a99e]">Computing memory bounds...</p>
              </div>
            )}

            {result && (
              <EstimationResultCard
                result={result}
                unit={unit}
                totalMemoryBytes={currentHardwareBytes}
              />
            )}

            {!isEstimating && !result && !errorMessage && (
              <div className="bg-[#181e1c] border border-[#27322e] rounded-xl p-8 text-center space-y-2">
                <Sliders size={24} className="text-[#617369] mx-auto" />
                <h3 className="text-sm font-semibold text-[#e4ece7]">No Calculation Yet</h3>
                <p className="text-xs text-[#8a9f94]">
                  Adjust parameters on the left and click &quot;Re-calculate Estimation&quot; to test.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
