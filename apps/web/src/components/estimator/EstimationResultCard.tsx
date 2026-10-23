'use client';

import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  HelpCircle,
  Cpu,
  Layers,
  Database,
  Terminal,
  Activity,
  Info,
} from 'lucide-react';
import { paths } from '@/api/schema';

type EstimationResult =
  paths['/api/v1/estimate']['post']['responses']['200']['content']['application/json'];

interface EstimationResultCardProps {
  result: EstimationResult;
  unit: 'GiB' | 'GB';
  totalMemoryBytes: number;
}

export const EstimationResultCard: React.FC<EstimationResultCardProps> = ({
  result,
  unit,
  totalMemoryBytes,
}) => {
  const divisor = unit === 'GiB' ? 1024 ** 3 : 10 ** 9;

  const formatBytes = (bytes: number) => {
    return (bytes / divisor).toFixed(2);
  };

  const isCannotEstimate = result.verdict === 'cannot_estimate';
  const isFits = result.verdict === 'fits';
  const isFitsTight = result.verdict === 'fits_tight';
  const isDoesNotFit = result.verdict === 'does_not_fit';

  const assumptions = result.assumptions ?? [];
  const warnings = result.warnings ?? [];
  const unsupportedReasons = result.unsupported_reasons ?? [];

  // Bar proportions
  const maxCapacity = Math.max(totalMemoryBytes, result.total_bytes, 1);
  const weightsPct = (result.weights_bytes / maxCapacity) * 100;
  const kvPct = (result.kv_cache_bytes / maxCapacity) * 100;
  const actPct = (result.activation_bytes / maxCapacity) * 100;
  const overheadPct = (result.runtime_overhead_bytes / maxCapacity) * 100;

  return (
    <div className="bg-[#181e1c] border border-[#27322e] rounded-xl p-5 shadow-lg space-y-6">
      {/* Header & Verdict Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#242e2a] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#75a691]" />
            <h3 className="text-base font-semibold text-[#e4ece7]">
              Memory Estimation Assessment
            </h3>
          </div>
          <p className="text-xs text-[#8a9f94] mt-0.5">
            Theoretical allocation based on deterministic calculation rules
          </p>
        </div>

        <div>
          {isFits && (
            <span
              id="verdict-fits-badge"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7be0a4] bg-[#1c3327] border border-[#2d563f] px-3.5 py-1.5 rounded-full shadow-sm"
            >
              <CheckCircle2 size={14} />
              <span>Fits Comfortably (&le;90% VRAM)</span>
            </span>
          )}
          {isFitsTight && (
            <span
              id="verdict-fits-tight-badge"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#f5cf6d] bg-[#332e18] border border-[#524923] px-3.5 py-1.5 rounded-full shadow-sm"
            >
              <AlertTriangle size={14} />
              <span>Fits Tight (90% - 100% VRAM)</span>
            </span>
          )}
          {isDoesNotFit && (
            <span
              id="verdict-does-not-fit-badge"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#f87171] bg-[#381e1e] border border-[#5a2e2e] px-3.5 py-1.5 rounded-full shadow-sm"
            >
              <AlertOctagon size={14} />
              <span>Does Not Fit (&gt;100% VRAM)</span>
            </span>
          )}
          {isCannotEstimate && (
            <span
              id="verdict-cannot-estimate-badge"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#cbd5e1] bg-[#222a27] border border-[#3b4843] px-3.5 py-1.5 rounded-full shadow-sm"
            >
              <HelpCircle size={14} />
              <span>Cannot Estimate</span>
            </span>
          )}
        </div>
      </div>

      {/* Stacked Memory Bar Visualization */}
      {!isCannotEstimate && (
        <div className="space-y-3">
          <div className="flex justify-between text-xs text-[#96a99e]">
            <span>Memory Allocation Breakdown</span>
            <span className="font-mono text-[#e4ece7]">
              {formatBytes(result.total_bytes)} / {formatBytes(totalMemoryBytes)} {unit}
            </span>
          </div>

          <div
            className="h-5 w-full bg-[#121615] rounded-lg overflow-hidden flex border border-[#25302b] p-0.5"
            role="progressbar"
            aria-valuenow={result.total_bytes}
            aria-valuemin={0}
            aria-valuemax={maxCapacity}
          >
            <div
              style={{ width: `${weightsPct}%` }}
              className="bg-[#5a826e] hover:bg-[#6c9a83] transition-all h-full rounded-l"
              title={`Weights: ${formatBytes(result.weights_bytes)} ${unit}`}
            />
            <div
              style={{ width: `${kvPct}%` }}
              className="bg-[#3a727d] hover:bg-[#4a8a97] transition-all h-full"
              title={`KV Cache: ${formatBytes(result.kv_cache_bytes)} ${unit}`}
            />
            <div
              style={{ width: `${actPct}%` }}
              className="bg-[#d97706] hover:bg-[#b45309] transition-all h-full"
              title={`Activations: ${formatBytes(result.activation_bytes)} ${unit}`}
            />
            <div
              style={{ width: `${overheadPct}%` }}
              className="bg-[#6366f1] hover:bg-[#4f46e5] transition-all h-full rounded-r"
              title={`Overhead: ${formatBytes(result.runtime_overhead_bytes)} ${unit}`}
            />
          </div>

          {/* Bar Legend */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded bg-[#5a826e]" />
              <span className="text-[#8a9f94]">Weights:</span>
              <span className="font-mono text-[#e4ece7]">{formatBytes(result.weights_bytes)} {unit}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded bg-[#3a727d]" />
              <span className="text-[#8a9f94]">KV Cache:</span>
              <span className="font-mono text-[#e4ece7]">{formatBytes(result.kv_cache_bytes)} {unit}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded bg-[#d97706]" />
              <span className="text-[#8a9f94]">Activations:</span>
              <span className="font-mono text-[#e4ece7]">{formatBytes(result.activation_bytes)} {unit}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded bg-[#6366f1]" />
              <span className="text-[#8a9f94]">Overhead:</span>
              <span className="font-mono text-[#e4ece7]">{formatBytes(result.runtime_overhead_bytes)} {unit}</span>
            </div>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#131917] border border-[#232c28] rounded-lg p-3">
          <div className="text-[11px] font-mono uppercase text-[#73887d] flex items-center gap-1.5">
            <Database size={13} />
            <span>Total Required</span>
          </div>
          <div className="text-xl font-bold font-mono text-[#e4ece7] mt-1">
            {formatBytes(result.total_bytes)} <span className="text-xs font-normal text-[#8a9f94]">{unit}</span>
          </div>
          {result.per_device_bytes && (
            <div className="text-[11px] text-[#75a691] mt-1">
              {formatBytes(result.per_device_bytes)} {unit} / device (sharded)
            </div>
          )}
        </div>

        <div className="bg-[#131917] border border-[#232c28] rounded-lg p-3">
          <div className="text-[11px] font-mono uppercase text-[#73887d] flex items-center gap-1.5">
            <Cpu size={13} />
            <span>Available Headroom</span>
          </div>
          <div
            className={`text-xl font-bold font-mono mt-1 ${
              result.headroom_bytes >= 0 ? 'text-[#7be0a4]' : 'text-[#f87171]'
            }`}
          >
            {result.headroom_bytes >= 0 ? '+' : ''}
            {formatBytes(result.headroom_bytes)}{' '}
            <span className="text-xs font-normal text-[#8a9f94]">{unit}</span>
          </div>
          <div className="text-[11px] text-[#8a9f94] mt-1">
            Usable hardware buffer
          </div>
        </div>

        <div className="bg-[#131917] border border-[#232c28] rounded-lg p-3">
          <div className="text-[11px] font-mono uppercase text-[#73887d] flex items-center gap-1.5">
            <Activity size={13} />
            <span>Confidence Level</span>
          </div>
          <div className="text-xl font-bold uppercase mt-1 text-[#e4ece7]">
            {result.confidence}
          </div>
          <div className="text-[11px] text-[#8a9f94] mt-1">
            {assumptions.length === 0
              ? 'Zero fallback assumptions'
              : `${assumptions.length} fallback assumption(s)`}
          </div>
        </div>
      </div>

      {/* Unsupported Reasons (if cannot_estimate) */}
      {unsupportedReasons.length > 0 && (
        <div className="bg-[#241a1a] border border-[#482828] rounded-lg p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#f87171]">
            <AlertOctagon size={14} />
            <span>Estimation Not Supported</span>
          </div>
          <ul className="text-xs text-[#e4ece7] space-y-1 pl-4 list-disc">
            {unsupportedReasons.map((reason, idx) => (
              <li key={idx} className="font-mono text-[11px] text-[#fca5a5]">
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Assumptions List */}
      {assumptions.length > 0 && (
        <div className="bg-[#1a2320] border border-[#2b3a34] rounded-lg p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#75a691]">
            <Info size={14} />
            <span>Applied Engineering Assumptions</span>
          </div>
          <ul className="text-xs text-[#8a9f94] space-y-1 pl-4 list-disc">
            {assumptions.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings List */}
      {warnings.length > 0 && (
        <div className="bg-[#2a2517] border border-[#4a3e23] rounded-lg p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#f5cf6d]">
            <AlertTriangle size={14} />
            <span>Operational Warnings</span>
          </div>
          <ul className="text-xs text-[#d1b065] space-y-1 pl-4 list-disc">
            {warnings.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Theoretical Disclaimer */}
      <div className="text-[11px] text-[#617369] border-t border-[#222a27] pt-3 flex items-start gap-2">
        <Info size={13} className="flex-shrink-0 mt-0.5 text-[#527a67]" />
        <span>
          <strong>Disclaimer:</strong> This is a deterministic mathematical estimate of required model memory.
          Speed (tokens/sec) and latency benchmarks are not measured. Real-world usage may vary based on OS display buffers,
          CUDA memory fragmentation, and runtime environment settings.
        </span>
      </div>
    </div>
  );
};
