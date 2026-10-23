'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, ArrowRight, ExternalLink } from 'lucide-react';
import { RecommendationCandidate } from '@/types/chat';

interface RecommendationCardViewProps {
  candidate: RecommendationCandidate;
}

export const RecommendationCardView: React.FC<RecommendationCardViewProps> = ({ candidate }) => {
  const est = candidate.estimate;
  const toGiB = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

  const totalGiB = toGiB(est.total_bytes);
  const weightsGiB = toGiB(est.weights_bytes);
  const kvGiB = toGiB(est.kv_cache_bytes);
  const headroomGiB = toGiB(est.headroom_bytes);

  const isFits = est.verdict === 'fits';
  const isFitsTight = est.verdict === 'fits_tight';

  const verdictBadgeClass = isFits
    ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800'
    : isFitsTight
    ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800'
    : 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800';

  const verdictLabel = isFits ? 'Fits Comfortably' : isFitsTight ? 'Fits Tight' : 'Exceeds Memory';

  // Headroom visual bar calculation
  const totalCapacity = est.total_bytes + est.headroom_bytes;
  const weightsPct = Math.min(100, (est.weights_bytes / totalCapacity) * 100);
  const kvPct = Math.min(100 - weightsPct, (est.kv_cache_bytes / totalCapacity) * 100);

  // Backend config values
  const quantLabel = candidate.quantization || 'q4_k_m';
  const kvLabel = candidate.kv_cache_dtype || 'fp16';
  const runtimeLabel = candidate.runtime || 'llama_cpp';
  const ctxLabel = candidate.context_length
    ? `${candidate.context_length.toLocaleString()} tokens`
    : '8,192 tokens';

  return (
    <div
      data-testid="recommendation-card"
      className="mt-3.5 bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-xl p-3.5 sm:p-4 text-xs transition-all shadow-sm"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-dark-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-slate-900 dark:text-sage-100 tracking-tight">
              {candidate.model_name || candidate.model_id}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-medium border px-2 py-0.5 rounded-full ${verdictBadgeClass}`}
            >
              {isFits ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
              <span>{verdictLabel}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-sage-400 mt-0.5">
            <span>By {candidate.author}</span>
            <span>•</span>
            <span>License: {candidate.license || 'unknown'}</span>
          </div>
        </div>

        <Link
          href={`/models/${candidate.model_id}`}
          className="text-[11px] text-slate-600 dark:text-sage-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 transition-colors self-start sm:self-auto"
        >
          <span>Model Hub</span>
          <ExternalLink size={11} />
        </Link>
      </div>

      {/* Backend Configuration Parameters Used */}
      <div className="my-2.5 flex flex-wrap items-center gap-2 text-[10px] font-mono">
        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-dark-elevated text-slate-700 dark:text-sage-200 border border-slate-200 dark:border-dark-border">
          Quant: {quantLabel}
        </span>
        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-dark-elevated text-slate-700 dark:text-sage-200 border border-slate-200 dark:border-dark-border">
          KV Cache: {kvLabel}
        </span>
        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-dark-elevated text-slate-700 dark:text-sage-200 border border-slate-200 dark:border-dark-border">
          Runtime: {runtimeLabel}
        </span>
        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-dark-elevated text-slate-700 dark:text-sage-200 border border-slate-200 dark:border-dark-border">
          Context: {ctxLabel}
        </span>
      </div>

      {/* Memory Allocation Bar */}
      <div className="my-3">
        <div className="flex justify-between text-[11px] font-mono text-slate-600 dark:text-sage-300 mb-1">
          <span>Deterministic Memory Allocation</span>
          <span>
            {totalGiB} GiB required ({headroomGiB} GiB free headroom)
          </span>
        </div>

        <div className="h-2 w-full bg-slate-100 dark:bg-dark-elevated rounded-full overflow-hidden flex border border-slate-200 dark:border-dark-border">
          <div
            style={{ width: `${weightsPct}%` }}
            className="bg-alloc-weights h-full"
            title={`Weights: ${weightsGiB} GiB`}
          />
          <div
            style={{ width: `${kvPct}%` }}
            className="bg-alloc-kv h-full"
            title={`KV Cache: ${kvGiB} GiB`}
          />
          <div className="flex-1 bg-alloc-headroom h-full" title={`Headroom: ${headroomGiB} GiB`} />
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[10px] text-slate-600 dark:text-sage-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-alloc-weights" />
            Weights: {weightsGiB} GiB
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-alloc-kv" />
            KV Cache: {kvGiB} GiB
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-alloc-headroom" />
            Headroom: {headroomGiB} GiB
          </span>
        </div>
      </div>

      {/* Rank reasons & Score */}
      {candidate.rank_reasons && candidate.rank_reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 my-2">
          {candidate.rank_reasons.map((reason, idx) => (
            <span
              key={idx}
              className="bg-slate-100 dark:bg-dark-elevated border border-slate-200 dark:border-dark-border text-slate-700 dark:text-sage-300 px-2 py-0.5 rounded text-[10px]"
            >
              {reason}
            </span>
          ))}
        </div>
      )}

      {/* Action Footer */}
      <div className="mt-3 pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-200 dark:border-dark-border">
        <span className="text-[11px] text-slate-500 dark:text-sage-400">
          {isFits ? 'Full GPU acceleration supported' : 'Tight fit — verify context settings'}
        </span>

        <Link
          href={`/models/${candidate.model_id}`}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-white bg-sage-700 hover:bg-sage-600 dark:bg-sage-800 dark:hover:bg-sage-700 border border-sage-600 dark:border-sage-700 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
        >
          <span>View Model Details</span>
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
};
