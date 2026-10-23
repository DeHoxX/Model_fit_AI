'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Download,
  Heart,
  Cpu,
  ShieldAlert,
  Calculator,
  AlertTriangle,
  FileCheck2,
  Layers,
  Settings,
  HelpCircle,
  Hash,
  Eye,
  FileCode,
  Tag,
} from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { paths } from '@/api/schema';

type ModelDetail =
  paths['/api/v1/models/{repo_id}']['get']['responses']['200']['content']['application/json'];

function formatParams(num?: number | null): string {
  if (!num) return 'Unknown';
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + ' Billion';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + ' Million';
  }
  return num.toLocaleString();
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'k';
  }
  return num.toString();
}

export default function ModelDetailPage() {
  const params = useParams();
  const repoIdParts = params?.repoId;
  const repoId = Array.isArray(repoIdParts)
    ? repoIdParts.join('/')
    : (repoIdParts as string) || '';

  const [model, setModel] = useState<ModelDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!repoId) return;

    let mounted = true;
    const fetchDetail = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await apiClient<ModelDetail>(`/api/v1/models/${repoId}`);
        if (mounted) {
          setModel(data);
        }
      } catch (err) {
        if (mounted) {
          const msg =
            err instanceof ApiError ? err.message : 'Failed to load model details from backend.';
          setError(msg);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    fetchDetail();
    return () => {
      mounted = false;
    };
  }, [repoId]);

  return (
    <div className="min-h-screen bg-[#0e1211] text-[#e4ece7]">
      {/* Top Header */}
      <header className="border-b border-[#1d2622] bg-[#111714]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href="/models"
            className="flex items-center gap-2 text-xs font-medium text-[#708479] hover:text-[#e4ece7] transition-colors"
            id="back-to-catalog-link"
          >
            <ArrowLeft size={14} />
            <span>Back to Model Catalog</span>
          </Link>

          {model && (
            model.is_supported ? (
              <Link
                href={`/estimator?repo_id=${encodeURIComponent(model.id)}`}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#22332a] hover:bg-[#2b4135] border border-[#3b5246] hover:border-[#4d6b5c] text-xs font-semibold text-[#a0c5b3] transition-colors shadow-sm"
                id="estimate-model-btn"
              >
                <Calculator size={14} />
                <span>Estimate Memory Footprint</span>
              </Link>
            ) : (
              <div
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#18201c] border border-[#26332d] text-xs font-medium text-[#708479] cursor-not-allowed opacity-80"
                title={model.support_reason_message || 'Model architecture is not supported for estimation'}
                id="estimate-model-btn-disabled"
              >
                <Calculator size={14} className="text-[#55695e]" />
                <span>Cannot Estimate ({model.support_reason_code || 'Unsupported'})</span>
              </div>
            )
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Loading State */}
        {isLoading && (
          <div className="bg-[#121915] border border-[#202c26] rounded-2xl p-8 space-y-4 animate-pulse">
            <div className="h-6 bg-[#1b2620] rounded w-1/3" />
            <div className="h-4 bg-[#17211c] rounded w-1/4" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6">
              <div className="h-20 bg-[#17211c] rounded-xl" />
              <div className="h-20 bg-[#17211c] rounded-xl" />
              <div className="h-20 bg-[#17211c] rounded-xl" />
              <div className="h-20 bg-[#17211c] rounded-xl" />
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-[#291717] border border-[#522b2b] rounded-2xl p-6 text-center space-y-3">
            <ShieldAlert size={28} className="mx-auto text-[#ef4444]" />
            <h3 className="text-sm font-semibold text-[#fca5a5]">Failed to load model</h3>
            <p className="text-xs text-[#f87171] max-w-md mx-auto">{error}</p>
            <Link
              href="/models"
              className="inline-block mt-2 text-xs font-medium text-[#fca5a5] hover:underline"
            >
              Return to Catalog
            </Link>
          </div>
        )}

        {/* Model Details View */}
        {model && (
          <>
            {/* Stale Cache Warning Banner */}
            {model.warning && (
              <div className="bg-[#261f12] border border-[#523e1f] rounded-xl p-4 flex items-center gap-3 text-xs text-[#fbbf24]">
                <AlertTriangle size={18} className="shrink-0 text-[#f59e0b]" />
                <div>
                  <span className="font-semibold block">Upstream Hub Disconnected</span>
                  <span>{model.warning}</span>
                </div>
              </div>
            )}

            {/* Unsupported / Incomplete Alert Banner */}
            {!model.is_supported && (
              <div className="bg-[#241a1a] border border-[#4d2d2d] rounded-xl p-4 flex items-start gap-3 text-xs text-[#fca5a5]">
                <AlertTriangle size={18} className="shrink-0 text-[#ef4444] mt-0.5" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-[#fca5a5]">
                      {model.support_status === 'incomplete_metadata'
                        ? 'Incomplete Architecture Metadata'
                        : model.support_status === 'unsupported_modality'
                        ? 'Unsupported Model Modality'
                        : 'Unsupported Architecture'}
                    </span>
                    {model.support_reason_code && (
                      <span className="font-mono text-[10px] bg-[#3d2020] border border-[#5c2e2e] px-1.5 py-0.5 rounded text-[#f87171]">
                        {model.support_reason_code}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#f87171]">
                    {model.support_reason_message ||
                      'This model architecture is not supported by the memory estimation engine.'}
                  </p>
                </div>
              </div>
            )}

            {/* Model Header Card */}
            <div className="bg-[#121915] border border-[#202c26] rounded-2xl p-6 md:p-8 space-y-6 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[#75a691] uppercase tracking-wider">
                      {model.author}
                    </span>
                    <span className="text-[#3b5246]">•</span>
                    <span className="text-xs text-[#61756a] font-mono">{model.pipeline_tag || 'text-generation'}</span>
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-[#e4ece7]">{model.model_name}</h1>
                  <p className="text-xs font-mono text-[#52635a]">{model.id}</p>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Provenance Badge */}
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-lg border ${
                      model.param_provenance === 'safetensors'
                        ? 'bg-[#182a20] text-[#86efac] border-[#2c4d39]'
                        : model.param_provenance === 'config'
                        ? 'bg-[#16212b] text-[#93c5fd] border-[#22394d]'
                        : 'bg-[#261f1b] text-[#fcd34d] border-[#4d3d24]'
                    }`}
                  >
                    <FileCheck2 size={13} />
                    <span>
                      {model.param_provenance === 'safetensors'
                        ? 'Safetensors Verified'
                        : model.param_provenance === 'config'
                        ? 'Config Parameters'
                        : 'Derived Parameters'}
                    </span>
                  </span>

                  {/* Gated Badge */}
                  {model.gated && (
                    <span className="inline-flex items-center gap-1 text-xs font-mono bg-[#2a2212] text-[#fbbf24] border border-[#48391b] px-2.5 py-1 rounded-lg">
                      <ShieldAlert size={13} />
                      Gated Model
                    </span>
                  )}

                  {/* Support Status Badge */}
                  {model.support_status === 'supported_llm' ? (
                    <span className="text-xs font-mono text-[#75a691] bg-[#16231d] border border-[#2a3c33] px-2.5 py-1 rounded-lg">
                      Supported LLM
                    </span>
                  ) : model.support_status === 'incomplete_metadata' ? (
                    <span className="text-xs font-mono text-[#fbbf24] bg-[#2a2212] border border-[#48391b] px-2.5 py-1 rounded-lg">
                      Incomplete Metadata ({model.support_reason_code || 'MISSING_CONFIG'})
                    </span>
                  ) : model.support_status === 'unsupported_modality' ? (
                    <span className="text-xs font-mono text-[#f87171] bg-[#291717] border border-[#4d2424] px-2.5 py-1 rounded-lg">
                      Non-LLM Modality
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-[#f87171] bg-[#291717] border border-[#4d2424] px-2.5 py-1 rounded-lg">
                      Unsupported Architecture
                    </span>
                  )}

                  {/* License Badge */}
                  {model.license && (
                    <span className="inline-flex items-center gap-1 text-xs font-mono bg-[#18201d] text-[#96a99e] border border-[#293631] px-2.5 py-1 rounded-lg">
                      <Tag size={12} />
                      {model.license}
                    </span>
                  )}
                </div>
              </div>

              {/* Stats Bar */}
              <div className="pt-4 border-t border-[#1b2520] grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-[#0e1411] border border-[#1b2620] rounded-xl p-3.5 space-y-1">
                  <span className="text-[11px] text-[#61756a] flex items-center gap-1.5">
                    <Hash size={13} className="text-[#43574c]" />
                    Total Parameters
                  </span>
                  <p className="text-base font-semibold font-mono text-[#e4ece7]">
                    {formatParams(model.normalized_model.total_params)}
                  </p>
                </div>

                <div className="bg-[#0e1411] border border-[#1b2620] rounded-xl p-3.5 space-y-1">
                  <span className="text-[11px] text-[#61756a] flex items-center gap-1.5">
                    <Download size={13} className="text-[#43574c]" />
                    Downloads
                  </span>
                  <p className="text-base font-semibold font-mono text-[#e4ece7]">
                    {formatNumber(model.downloads)}
                  </p>
                </div>

                <div className="bg-[#0e1411] border border-[#1b2620] rounded-xl p-3.5 space-y-1">
                  <span className="text-[11px] text-[#61756a] flex items-center gap-1.5">
                    <Heart size={13} className="text-[#43574c]" />
                    Hub Likes
                  </span>
                  <p className="text-base font-semibold font-mono text-[#e4ece7]">
                    {formatNumber(model.likes)}
                  </p>
                </div>

                <div className="bg-[#0e1411] border border-[#1b2620] rounded-xl p-3.5 space-y-1">
                  <span className="text-[11px] text-[#61756a] flex items-center gap-1.5">
                    <Layers size={13} className="text-[#43574c]" />
                    Context Window
                  </span>
                  <p className="text-base font-semibold font-mono text-[#e4ece7]">
                    {model.normalized_model.max_context_length
                      ? `${model.normalized_model.max_context_length.toLocaleString()} tokens`
                      : 'Unknown'}
                  </p>
                </div>
              </div>
            </div>

            {/* Architecture Specifications Grid */}
            <div className="bg-[#121915] border border-[#202c26] rounded-2xl p-6 md:p-8 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-[#e4ece7] flex items-center gap-2">
                    <Cpu size={16} className="text-[#75a691]" />
                    Normalized Architecture Specifications
                  </h2>
                  <p className="text-xs text-[#708479]">
                    Normalized parameters ingested deterministically from Hub metadata.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
                <div className="p-3 bg-[#0d1210] border border-[#1b2620] rounded-xl flex items-center justify-between">
                  <span className="text-xs text-[#708479]">Architecture Name</span>
                  <span className="text-xs font-mono text-[#a0c5b3] font-medium">
                    {model.normalized_model.architecture_name}
                  </span>
                </div>

                <div className="p-3 bg-[#0d1210] border border-[#1b2620] rounded-xl flex items-center justify-between">
                  <span className="text-xs text-[#708479]">Architecture Category</span>
                  <span className="text-xs font-mono text-[#a0c5b3] font-medium">
                    {model.normalized_model.architecture_category}
                  </span>
                </div>

                <div className="p-3 bg-[#0d1210] border border-[#1b2620] rounded-xl flex items-center justify-between">
                  <span className="text-xs text-[#708479]">Attention Variant</span>
                  <span className="text-xs font-mono text-[#a0c5b3] font-medium">
                    {model.normalized_model.attention_variant}
                  </span>
                </div>

                <div className="p-3 bg-[#0d1210] border border-[#1b2620] rounded-xl flex items-center justify-between">
                  <span className="text-xs text-[#708479]">Hidden Layers</span>
                  <span className="text-xs font-mono text-[#e4ece7] font-medium">
                    {model.normalized_model.num_layers ?? 'N/A'}
                  </span>
                </div>

                <div className="p-3 bg-[#0d1210] border border-[#1b2620] rounded-xl flex items-center justify-between">
                  <span className="text-xs text-[#708479]">Hidden Size</span>
                  <span className="text-xs font-mono text-[#e4ece7] font-medium">
                    {model.normalized_model.hidden_size ?? 'N/A'}
                  </span>
                </div>

                <div className="p-3 bg-[#0d1210] border border-[#1b2620] rounded-xl flex items-center justify-between">
                  <span className="text-xs text-[#708479]">Attention Heads</span>
                  <span className="text-xs font-mono text-[#e4ece7] font-medium">
                    {model.normalized_model.num_attention_heads ?? 'N/A'}
                  </span>
                </div>

                <div className="p-3 bg-[#0d1210] border border-[#1b2620] rounded-xl flex items-center justify-between">
                  <span className="text-xs text-[#708479]">KV Heads</span>
                  <span className="text-xs font-mono text-[#e4ece7] font-medium">
                    {model.normalized_model.num_kv_heads ?? 'N/A'}
                  </span>
                </div>

                <div className="p-3 bg-[#0d1210] border border-[#1b2620] rounded-xl flex items-center justify-between">
                  <span className="text-xs text-[#708479]">Head Dimension</span>
                  <span className="text-xs font-mono text-[#e4ece7] font-medium">
                    {model.normalized_model.head_dim ?? 'N/A'}
                  </span>
                </div>

                <div className="p-3 bg-[#0d1210] border border-[#1b2620] rounded-xl flex items-center justify-between">
                  <span className="text-xs text-[#708479]">Vocab Size</span>
                  <span className="text-xs font-mono text-[#e4ece7] font-medium">
                    {model.normalized_model.vocab_size?.toLocaleString() ?? 'N/A'}
                  </span>
                </div>

                {model.normalized_model.num_experts && (
                  <div className="p-3 bg-[#0d1210] border border-[#1b2620] rounded-xl flex items-center justify-between">
                    <span className="text-xs text-[#708479]">MoE Experts (Total / Active)</span>
                    <span className="text-xs font-mono text-[#a0c5b3] font-medium">
                      {model.normalized_model.num_experts} / {model.normalized_model.experts_per_token ?? 1}
                    </span>
                  </div>
                )}

                {model.normalized_model.sliding_window_size && (
                  <div className="p-3 bg-[#0d1210] border border-[#1b2620] rounded-xl flex items-center justify-between">
                    <span className="text-xs text-[#708479]">Sliding Window Size</span>
                    <span className="text-xs font-mono text-[#a0c5b3] font-medium">
                      {model.normalized_model.sliding_window_size.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Estimate CTA Banner */}
            <div className="bg-[#15241d] border border-[#2d473a] rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[#e4ece7]">
                  Check if your GPU or Mac can run {model.model_name}
                </h3>
                <p className="text-xs text-[#8eb4a1]">
                  Test various quantizations (Q4_K_M, INT8, FP16) and context sizes against your hardware.
                </p>
              </div>

              <Link
                href={`/estimator?repo_id=${encodeURIComponent(model.id)}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2b4236] hover:bg-[#375445] text-xs font-semibold text-[#d4ebe0] transition-colors shrink-0 shadow-sm"
              >
                <Calculator size={15} />
                <span>Run Estimation</span>
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
