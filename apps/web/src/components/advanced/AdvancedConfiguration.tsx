import React, { useState } from 'react';
import { ArrowLeft, RefreshCw, Sliders } from 'lucide-react';
import { UserHardwareProfile } from '../../types/hardware';
import { AIModelSpec, QuantizationType } from '../../types/models';
import { HardwareSelector } from './HardwareSelector';
import { ModelSelector } from './ModelSelector';
import { MemoryEstimatePanel } from './MemoryEstimatePanel';
import { calculateMemoryRequirements } from '../../services/calculationEngine';

interface AdvancedConfigurationProps {
  hardware: UserHardwareProfile;
  onChangeHardware: (hardware: UserHardwareProfile) => void;
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
  onBackToChat: () => void;
  onViewReport: () => void;
}

export const AdvancedConfiguration: React.FC<AdvancedConfigurationProps> = ({
  hardware,
  onChangeHardware,
  selectedModel,
  onSelectModel,
  quantization,
  onChangeQuantization,
  contextLength,
  onChangeContextLength,
  batchSize,
  onChangeBatchSize,
  runtime,
  onChangeRuntime,
  onBackToChat,
  onViewReport
}) => {
  const [isCalculating, setIsCalculating] = useState(false);

  // Live calculation
  const calculation = calculateMemoryRequirements(
    selectedModel,
    quantization,
    contextLength,
    batchSize,
    hardware
  );

  const handleManualRecalculate = () => {
    setIsCalculating(true);
    setTimeout(() => setIsCalculating(false), 300);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 max-w-4xl mx-auto w-full space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#242e2a] pb-4">
        <div>
          <button
            type="button"
            onClick={onBackToChat}
            className="flex items-center gap-1.5 text-xs text-[#8a9f94] hover:text-[#e4ece7] mb-1.5 transition-colors"
          >
            <ArrowLeft size={13} />
            <span>Return to Conversational Advisor</span>
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-[#e4ece7] tracking-tight">
            Advanced Configuration
          </h1>
          <p className="text-xs text-[#8a9f94] mt-0.5">
            Manually configure an AI model and estimate whether it fits your hardware.
          </p>
        </div>

        <button
          type="button"
          onClick={handleManualRecalculate}
          className="flex items-center gap-2 text-xs font-medium text-[#e4ece7] bg-[#22332a] hover:bg-[#2b4236] border border-[#395747] px-3.5 py-2 rounded-lg transition-colors shadow-sm self-start sm:self-auto"
        >
          <RefreshCw size={13} className={isCalculating ? 'animate-spin' : ''} />
          <span>Recalculate Fit</span>
        </button>
      </div>

      {/* Hardware Settings Section */}
      <HardwareSelector hardware={hardware} onChange={onChangeHardware} />

      {/* Model Parameters Section */}
      <ModelSelector
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
        quantization={quantization}
        onChangeQuantization={onChangeQuantization}
        contextLength={contextLength}
        onChangeContextLength={onChangeContextLength}
        batchSize={batchSize}
        onChangeBatchSize={onChangeBatchSize}
        runtime={runtime}
        onChangeRuntime={onChangeRuntime}
      />

      {/* Calculation Results Section */}
      <MemoryEstimatePanel
        calculation={calculation}
        model={selectedModel}
        hardware={hardware}
        onViewReport={onViewReport}
      />
    </div>
  );
};
