export type GPUVendor = 'nvidia' | 'amd' | 'apple' | 'intel' | 'cpu';

export interface GPUSpec {
  id: string;
  name: string;
  vendor: GPUVendor;
  vramGB: number;
  memoryBandwidthGBs?: number;
  isUnifiedMemory?: boolean;
  category: 'consumer' | 'workstation' | 'mobile' | 'integrated';
}

export interface UserHardwareProfile {
  gpu: GPUSpec;
  customGpuName?: string;
  customVramGB?: number;
  systemRamGB: number;
  occupiedRamGB: number;
  operatingSystem: 'windows' | 'mac' | 'linux';
}

export interface MemoryCalculationResult {
  modelWeightsGB: number;
  kvCacheGB: number;
  runtimeOverheadGB: number;
  totalRequiredVramGB: number;
  availableVramGB: number;
  headroomGB: number; // positive = free VRAM, negative = shortfall
  systemRamNeededGB: number;
  systemRamAvailableGB: number;
  compatibilityStatus: 'optimal' | 'acceptable' | 'partial_offload' | 'exceeds';
  statusLabel: string;
  statusExplanation: string;
  estimatedTokensPerSecond?: number;
  recommendedAction?: string;
}
