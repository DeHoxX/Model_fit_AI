import { AIModelSpec, QuantizationType } from '../types/models';
import { UserHardwareProfile, MemoryCalculationResult } from '../types/hardware';
import { QUANTIZATION_OPTIONS } from './modelDatabase';

/**
 * Deterministic memory compatibility calculation engine inspired by Can It Run AI?
 * Calculates real model weights size, KV cache footprint, and runtime overhead.
 */
export function calculateMemoryRequirements(
  model: AIModelSpec,
  quantization: QuantizationType,
  contextLength: number,
  batchSize: number = 1,
  hardware: UserHardwareProfile
): MemoryCalculationResult {
  const quantOption =
    QUANTIZATION_OPTIONS.find(q => q.type === quantization) || QUANTIZATION_OPTIONS[0];

  // 1. Model Weights Calculation
  // Formula: (Params * 10^9 * bitsPerWeight / 8) / 1024^3 * 1.05 (for layer normalization & embedding overhead)
  const bitsPerWeight = quantOption.bitsPerWeight;
  const rawBytes = (model.parameterCountBillions * 1e9 * bitsPerWeight) / 8;
  const modelWeightsGB = Number(((rawBytes / (1024 * 1024 * 1024)) * 1.05).toFixed(2));

  // 2. KV Cache Calculation
  // Standard transformer layer architectures:
  // Estimated layers & KV heads based on parameter scale
  let layers = 32;
  let kvHeads = 8;
  let headDim = 128;

  if (model.parameterCountBillions >= 60) {
    layers = 80;
    kvHeads = 8;
    headDim = 128;
  } else if (model.parameterCountBillions >= 25) {
    layers = 64;
    kvHeads = 8;
    headDim = 128;
  } else if (model.parameterCountBillions <= 4) {
    layers = 24;
    kvHeads = 4;
    headDim = 96;
  }

  // KV Cache = 2 (keys + values) * batchSize * contextLength * layers * kvHeads * headDim * 2 bytes (FP16)
  const kvBytes = 2 * batchSize * contextLength * layers * kvHeads * headDim * 2;
  const kvCacheGB = Number((kvBytes / (1024 * 1024 * 1024)).toFixed(2));

  // 3. Runtime Context / Driver Overhead
  const runtimeOverheadGB = 0.65;

  // 4. Total Required VRAM
  const totalRequiredVramGB = Number(
    (modelWeightsGB + kvCacheGB + runtimeOverheadGB).toFixed(2)
  );

  // 5. Hardware Availability
  const availableVramGB = hardware.gpu.vramGB;
  const headroomGB = Number((availableVramGB - totalRequiredVramGB).toFixed(2));

  const systemRamAvailableGB = Math.max(
    0,
    hardware.systemRamGB - hardware.occupiedRamGB
  );

  // 6. Compatibility Classification
  let compatibilityStatus: MemoryCalculationResult['compatibilityStatus'];
  let statusLabel: string;
  let statusExplanation: string;
  let recommendedAction: string | undefined;

  if (headroomGB >= 0.8) {
    compatibilityStatus = 'optimal';
    statusLabel = 'Likely to Fit (100% GPU VRAM)';
    statusExplanation = `Your ${hardware.gpu.name} has ${availableVramGB}GB VRAM, comfortably fitting the ${model.name} (${quantization}) with ${headroomGB}GB headroom.`;
    recommendedAction = 'Full speed CUDA/Metal acceleration enabled with zero system RAM offloading.';
  } else if (headroomGB >= -0.75) {
    compatibilityStatus = 'acceptable';
    statusLabel = 'May Fit with Reduced Context';
    statusExplanation = `Weights will fit, but at ${contextLength.toLocaleString()} context, KV cache approaches your VRAM limit (${availableVramGB}GB).`;
    recommendedAction = 'Lowering context length to 4096 or using Q4_K_M will provide safe headroom.';
  } else if (totalRequiredVramGB <= availableVramGB + systemRamAvailableGB * 0.85) {
    compatibilityStatus = 'partial_offload';
    statusLabel = 'Partial GPU Offload (RAM Shared)';
    const shortfall = Math.abs(headroomGB);
    statusExplanation = `Requires ${totalRequiredVramGB}GB total memory. ~${shortfall}GB will spill over into System RAM.`;
    recommendedAction = 'Expect 2x - 5x slower generation speeds due to CPU-PCIe bus bandwidth transfer.';
  } else {
    compatibilityStatus = 'exceeds';
    statusLabel = 'Likely to Exceed Available Memory';
    statusExplanation = `This configuration demands ${totalRequiredVramGB}GB memory, exceeding both GPU VRAM (${availableVramGB}GB) and usable System RAM (${systemRamAvailableGB}GB).`;
    recommendedAction = 'Select a more compact parameter model (e.g. 7B or 8B) or a higher compression quant (Q4_K_M).';
  }

  // 7. Estimated Tokens/Sec
  const bandwidth = hardware.gpu.memoryBandwidthGBs || 300;
  let estimatedTokensPerSecond: number;
  if (compatibilityStatus === 'optimal') {
    estimatedTokensPerSecond = Math.round(
      Math.min(120, (bandwidth / (modelWeightsGB * 1.5)) * 0.85)
    );
  } else if (compatibilityStatus === 'acceptable') {
    estimatedTokensPerSecond = Math.round(
      Math.min(90, (bandwidth / (modelWeightsGB * 1.8)) * 0.7)
    );
  } else {
    estimatedTokensPerSecond = Math.round(Math.max(4, 25 / (modelWeightsGB * 0.5)));
  }

  return {
    modelWeightsGB,
    kvCacheGB,
    runtimeOverheadGB,
    totalRequiredVramGB,
    availableVramGB,
    headroomGB,
    systemRamNeededGB: headroomGB < 0 ? Math.abs(headroomGB) : 0,
    systemRamAvailableGB,
    compatibilityStatus,
    statusLabel,
    statusExplanation,
    estimatedTokensPerSecond,
    recommendedAction
  };
}
