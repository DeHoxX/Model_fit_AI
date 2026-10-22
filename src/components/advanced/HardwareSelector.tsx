import React, { useState } from 'react';
import { Cpu, ChevronDown, Check } from 'lucide-react';
import { UserHardwareProfile, GPUSpec } from '../../types/hardware';
import { POPULAR_GPUS } from '../../services/hardwareDatabase';

interface HardwareSelectorProps {
  hardware: UserHardwareProfile;
  onChange: (updated: UserHardwareProfile) => void;
}

export const HardwareSelector: React.FC<HardwareSelectorProps> = ({ hardware, onChange }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchGpu, setSearchGpu] = useState('');

  const filteredGpus = POPULAR_GPUS.filter(g =>
    g.name.toLowerCase().includes(searchGpu.toLowerCase())
  );

  const handleSelectGpu = (gpu: GPUSpec) => {
    onChange({
      ...hardware,
      gpu,
      customVramGB: gpu.vramGB
    });
    setIsDropdownOpen(false);
  };

  return (
    <div className="bg-[#181e1c] border border-[#27322e] rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-[#242e2a] pb-3">
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-[#75a691]" />
          <h2 className="text-sm font-semibold text-[#e4ece7]">Hardware Specifications</h2>
        </div>
        <span className="text-xs text-[#6e8579] font-mono">Host Machine</span>
      </div>

      {/* GPU Model Selector */}
      <div className="relative">
        <label className="block text-xs font-medium text-[#96a99e] mb-1.5">
          Graphics Card (GPU)
        </label>

        <button
          type="button"
          onClick={() => setIsDropdownOpen(prev => !prev)}
          className="w-full flex items-center justify-between bg-[#131716] border border-[#2e3b35] hover:border-[#3e5249] text-left px-3 py-2 rounded-lg text-xs text-[#e4ece7] transition-colors"
        >
          <div className="flex items-center gap-2 truncate">
            <span className="w-2 h-2 rounded-full bg-[#75a691]" />
            <span className="truncate">{hardware.gpu.name}</span>
          </div>
          <ChevronDown size={14} className="text-[#6e8579] flex-shrink-0" />
        </button>

        {isDropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#161c1a] border border-[#2f3d37] rounded-lg shadow-xl z-30 max-h-56 overflow-y-auto p-1.5">
            <input
              type="text"
              placeholder="Search GPU..."
              value={searchGpu}
              onChange={e => setSearchGpu(e.target.value)}
              className="w-full bg-[#101413] border border-[#242e2a] rounded px-2.5 py-1 text-xs text-[#e4ece7] mb-1.5 focus:outline-none focus:border-[#3b5246]"
              autoFocus
            />

            <div className="space-y-0.5">
              {filteredGpus.map(g => (
                <button
                  type="button"
                  key={g.id}
                  onClick={() => handleSelectGpu(g)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs text-left transition-colors ${
                    g.id === hardware.gpu.id
                      ? 'bg-[#22312a] text-[#7be0a4] font-medium'
                      : 'text-[#96a99e] hover:bg-[#1b2320] hover:text-[#e4ece7]'
                  }`}
                >
                  <span className="truncate">{g.name}</span>
                  <span className="font-mono text-[10.5px] text-[#617369] pl-2">
                    {g.vramGB}GB VRAM
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Numerical Specs: VRAM & System RAM */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* VRAM */}
        <div>
          <label className="block text-xs font-medium text-[#96a99e] mb-1">
            Dedicated VRAM
          </label>
          <div className="relative">
            <input
              type="number"
              min={2}
              max={192}
              value={hardware.gpu.vramGB}
              onChange={e => {
                const val = Math.max(1, Number(e.target.value));
                onChange({
                  ...hardware,
                  gpu: { ...hardware.gpu, vramGB: val }
                });
              }}
              className="w-full bg-[#131716] border border-[#2e3b35] focus:border-[#4d6b5c] px-2.5 py-1.5 rounded-lg text-xs font-mono text-[#e4ece7]"
            />
            <span className="absolute right-2.5 top-2 text-[11px] text-[#6e8579] font-mono pointer-events-none">
              GB
            </span>
          </div>
        </div>

        {/* System RAM */}
        <div>
          <label className="block text-xs font-medium text-[#96a99e] mb-1">
            System RAM
          </label>
          <div className="relative">
            <input
              type="number"
              min={4}
              max={512}
              value={hardware.systemRamGB}
              onChange={e => {
                const val = Math.max(4, Number(e.target.value));
                onChange({
                  ...hardware,
                  systemRamGB: val
                });
              }}
              className="w-full bg-[#131716] border border-[#2e3b35] focus:border-[#4d6b5c] px-2.5 py-1.5 rounded-lg text-xs font-mono text-[#e4ece7]"
            />
            <span className="absolute right-2.5 top-2 text-[11px] text-[#6e8579] font-mono pointer-events-none">
              GB
            </span>
          </div>
        </div>

        {/* Occupied / App RAM */}
        <div>
          <label className="block text-xs font-medium text-[#96a99e] mb-1">
            Occupied RAM (OS/Apps)
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={hardware.systemRamGB - 2}
              value={hardware.occupiedRamGB}
              onChange={e => {
                const val = Math.max(0, Number(e.target.value));
                onChange({
                  ...hardware,
                  occupiedRamGB: val
                });
              }}
              className="w-full bg-[#131716] border border-[#2e3b35] focus:border-[#4d6b5c] px-2.5 py-1.5 rounded-lg text-xs font-mono text-[#e4ece7]"
            />
            <span className="absolute right-2.5 top-2 text-[11px] text-[#6e8579] font-mono pointer-events-none">
              GB
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
