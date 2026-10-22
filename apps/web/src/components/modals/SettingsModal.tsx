import React from 'react';
import { X, Settings, ShieldCheck, Terminal, HardDrive } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRuntime: string;
  onSaveRuntime: (runtime: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  defaultRuntime,
  onSaveRuntime
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#181e1c] border border-[#2b3a33] rounded-2xl max-w-md w-full shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[#242e2a] pb-3">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-[#75a691]" />
            <h3 className="text-sm font-semibold text-[#e4ece7]">LocalIQ Settings</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#617369] hover:text-[#96a99e] rounded"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1.5">
              Default Local Inference Engine
            </label>
            <select
              value={defaultRuntime}
              onChange={e => onSaveRuntime(e.target.value)}
              className="w-full bg-[#131716] border border-[#2e3b35] px-2.5 py-1.5 rounded-lg text-xs text-[#e4ece7] focus:outline-none"
            >
              {['Ollama', 'LM Studio', 'vLLM', 'llama.cpp', 'ExLlamaV2'].map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-[#131716] border border-[#242e2a] rounded-lg p-3 space-y-1.5 text-[#8a9f94]">
            <div className="flex items-center gap-1.5 text-[#75a691] font-semibold text-xs">
              <ShieldCheck size={14} />
              <span>Local Privacy Assurance</span>
            </div>
            <p className="leading-relaxed">
              All memory requirement calculations and hardware checks run 100% locally on your client machine. No telemetry or system data is sent to external servers.
            </p>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium text-[#e4ece7] bg-[#22332a] hover:bg-[#2b4236] border border-[#395747] rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
