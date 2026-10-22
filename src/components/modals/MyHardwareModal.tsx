import React, { useState } from 'react';
import { X, Cpu, Check, HardDrive, RefreshCw } from 'lucide-react';
import { UserHardwareProfile } from '../../types/hardware';
import { POPULAR_GPUS } from '../../services/hardwareDatabase';

interface MyHardwareModalProps {
  isOpen: boolean;
  onClose: () => void;
  hardware: UserHardwareProfile;
  onSave: (updated: UserHardwareProfile) => void;
}

export const MyHardwareModal: React.FC<MyHardwareModalProps> = ({
  isOpen,
  onClose,
  hardware,
  onSave
}) => {
  const [profile, setProfile] = useState<UserHardwareProfile>(hardware);
  const [isDetecting, setIsDetecting] = useState(false);

  if (!isOpen) return null;

  const handleSimulateDetect = () => {
    setIsDetecting(true);
    setTimeout(() => {
      setIsDetecting(false);
      setProfile(prev => ({
        ...prev,
        gpu: POPULAR_GPUS.find(g => g.id === 'rtx-3060-12gb') || prev.gpu,
        systemRamGB: 32,
        occupiedRamGB: 7
      }));
    }, 600);
  };

  const handleSave = () => {
    onSave(profile);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#181e1c] border border-[#2b3a33] rounded-2xl max-w-md w-full shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[#242e2a] pb-3">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-[#75a691]" />
            <h3 className="text-sm font-semibold text-[#e4ece7]">Host Hardware Profile</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#617369] hover:text-[#96a99e] rounded"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-[#8a9f94]">
          Configure your local machine specs to automatically calculate memory fit across all models.
        </p>

        {/* Auto Detect Button */}
        <button
          type="button"
          onClick={handleSimulateDetect}
          className="w-full flex items-center justify-center gap-2 text-xs font-medium text-[#8eb4a1] bg-[#1a2621] hover:bg-[#23352d] border border-[#2e473b] py-2 px-3 rounded-lg transition-colors"
        >
          <RefreshCw size={13} className={isDetecting ? 'animate-spin' : ''} />
          <span>{isDetecting ? 'Querying system telemetry...' : 'Auto-Detect Host Hardware'}</span>
        </button>

        {/* Form Fields */}
        <div className="space-y-3 pt-1">
          <div>
            <label className="block text-xs font-medium text-[#96a99e] mb-1">
              Select Installed GPU
            </label>
            <select
              value={profile.gpu.id}
              onChange={e => {
                const found = POPULAR_GPUS.find(g => g.id === e.target.value);
                if (found) setProfile({ ...profile, gpu: found });
              }}
              className="w-full bg-[#131716] border border-[#2e3b35] px-2.5 py-1.5 rounded-lg text-xs text-[#e4ece7] focus:outline-none"
            >
              {POPULAR_GPUS.map(g => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.vramGB}GB VRAM)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#96a99e] mb-1">
                Dedicated VRAM (GB)
              </label>
              <input
                type="number"
                value={profile.gpu.vramGB}
                onChange={e =>
                  setProfile({
                    ...profile,
                    gpu: { ...profile.gpu, vramGB: Math.max(1, Number(e.target.value)) }
                  })
                }
                className="w-full bg-[#131716] border border-[#2e3b35] px-2.5 py-1.5 rounded-lg text-xs font-mono text-[#e4ece7]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#96a99e] mb-1">
                System RAM (GB)
              </label>
              <input
                type="number"
                value={profile.systemRamGB}
                onChange={e =>
                  setProfile({
                    ...profile,
                    systemRamGB: Math.max(4, Number(e.target.value))
                  })
                }
                className="w-full bg-[#131716] border border-[#2e3b35] px-2.5 py-1.5 rounded-lg text-xs font-mono text-[#e4ece7]"
              />
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#242e2a]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[#96a99e] hover:text-[#e4ece7] rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-[#e4ece7] bg-[#2a4034] hover:bg-[#385545] border border-[#446653] rounded-lg transition-colors shadow-sm"
          >
            <Check size={13} />
            <span>Save Profile</span>
          </button>
        </div>
      </div>
    </div>
  );
};
