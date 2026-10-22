import React from 'react';
import { CheckCircle2, AlertTriangle, Zap, Check } from 'lucide-react';
import { AIModelSpec } from '../../types/models';
import { UserHardwareProfile } from '../../types/hardware';
import { calculateMemoryRequirements } from '../../services/calculationEngine';

interface ModelComparisonTableProps {
  primaryModel: AIModelSpec;
  hardware: UserHardwareProfile;
  alternativeModels: AIModelSpec[];
  onSelectAlternative: (model: AIModelSpec) => void;
}

export const ModelComparisonTable: React.FC<ModelComparisonTableProps> = ({
  primaryModel,
  hardware,
  alternativeModels,
  onSelectAlternative
}) => {
  const allModels = [primaryModel, ...alternativeModels.filter(m => m.id !== primaryModel.id).slice(0, 3)];

  return (
    <div className="bg-[#181e1c] border border-[#27322e] rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-[#242e2a] pb-3">
        <div>
          <h3 className="text-sm font-semibold text-[#e4ece7]">
            Model Alternatives & Trade-Offs
          </h3>
          <p className="text-xs text-[#8a9f94]">
            Compare primary recommendation against faster and heavier alternatives on your {hardware.gpu.name}.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#242e2a] text-[#71877b] font-mono">
              <th className="py-2.5 px-3">Model</th>
              <th className="py-2.5 px-3">Parameters</th>
              <th className="py-2.5 px-3">Memory (VRAM)</th>
              <th className="py-2.5 px-3">Compatibility</th>
              <th className="py-2.5 px-3">Speed Rating</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#202925]">
            {allModels.map((model, idx) => {
              const isPrimary = model.id === primaryModel.id;
              const calc = calculateMemoryRequirements(model, 'Q4_K_M', 8192, 1, hardware);

              return (
                <tr
                  key={model.id}
                  className={`hover:bg-[#141a18] transition-colors ${
                    isPrimary ? 'bg-[#1b2521]/60' : ''
                  }`}
                >
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      {isPrimary && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#75a691]" />
                      )}
                      <div>
                        <div className="font-semibold text-[#e4ece7] flex items-center gap-1.5">
                          <span>{model.name}</span>
                          {isPrimary && (
                            <span className="text-[10px] text-[#7be0a4] bg-[#1d3327] border border-[#2c533e] px-1.5 py-0.2 rounded font-mono">
                              Top Pick
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#8a9f94] truncate max-w-xs">
                          {model.recommendedFor}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-3 font-mono text-[#96a99e]">
                    {model.displayParameters}
                  </td>

                  <td className="py-3 px-3 font-mono">
                    <span className="text-[#e4ece7] font-semibold">
                      {calc.totalRequiredVramGB} GB
                    </span>
                    <span className="text-[10.5px] text-[#617369] block">
                      ({calc.headroomGB >= 0 ? `+${calc.headroomGB}GB Free` : `${Math.abs(calc.headroomGB)}GB Over`})
                    </span>
                  </td>

                  <td className="py-3 px-3">
                    {calc.compatibilityStatus === 'optimal' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#7be0a4]">
                        <CheckCircle2 size={12} />
                        <span>Full GPU VRAM</span>
                      </span>
                    ) : calc.compatibilityStatus === 'acceptable' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#f5cf6d]">
                        <AlertTriangle size={12} />
                        <span>Reduced Context</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#f87171]">
                        <span>Exceeds Memory</span>
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3">
                    <span className="inline-flex items-center gap-1 text-xs text-[#c4d5cc] font-mono">
                      <Zap size={12} className="text-[#f5cf6d]" />
                      <span>~{calc.estimatedTokensPerSecond} t/s ({model.speedRating})</span>
                    </span>
                  </td>

                  <td className="py-3 px-3 text-right">
                    {!isPrimary ? (
                      <button
                        type="button"
                        onClick={() => onSelectAlternative(model)}
                        className="text-xs text-[#8eb4a1] hover:text-[#e4ece7] bg-[#1d2723] hover:bg-[#283830] border border-[#33443d] px-2.5 py-1 rounded-md transition-colors"
                      >
                        Inspect
                      </button>
                    ) : (
                      <span className="text-[11px] text-[#75a691] font-mono">Selected</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
