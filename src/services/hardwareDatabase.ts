import { GPUSpec, UserHardwareProfile } from '../types/hardware';

export const POPULAR_GPUS: GPUSpec[] = [
  // NVIDIA High End
  { id: 'rtx-4090', name: 'NVIDIA GeForce RTX 4090', vendor: 'nvidia', vramGB: 24, memoryBandwidthGBs: 1008, category: 'consumer' },
  { id: 'rtx-3090', name: 'NVIDIA GeForce RTX 3090 / 3090 Ti', vendor: 'nvidia', vramGB: 24, memoryBandwidthGBs: 936, category: 'consumer' },
  { id: 'rtx-4080', name: 'NVIDIA GeForce RTX 4080 / 4080 Super', vendor: 'nvidia', vramGB: 16, memoryBandwidthGBs: 736, category: 'consumer' },
  { id: 'rtx-4070-ti-super', name: 'NVIDIA GeForce RTX 4070 Ti Super', vendor: 'nvidia', vramGB: 16, memoryBandwidthGBs: 672, category: 'consumer' },

  // NVIDIA Mid Range
  { id: 'rtx-4070', name: 'NVIDIA GeForce RTX 4070 / 4070 Super', vendor: 'nvidia', vramGB: 12, memoryBandwidthGBs: 504, category: 'consumer' },
  { id: 'rtx-3060-12gb', name: 'NVIDIA GeForce RTX 3060 12GB', vendor: 'nvidia', vramGB: 12, memoryBandwidthGBs: 360, category: 'consumer' },
  { id: 'rtx-4060-ti-16gb', name: 'NVIDIA GeForce RTX 4060 Ti 16GB', vendor: 'nvidia', vramGB: 16, memoryBandwidthGBs: 288, category: 'consumer' },
  { id: 'rtx-4060', name: 'NVIDIA GeForce RTX 4060 8GB', vendor: 'nvidia', vramGB: 8, memoryBandwidthGBs: 272, category: 'consumer' },
  { id: 'rtx-3070', name: 'NVIDIA GeForce RTX 3070 / 3070 Ti', vendor: 'nvidia', vramGB: 8, memoryBandwidthGBs: 448, category: 'consumer' },
  { id: 'rtx-3060-laptop', name: 'NVIDIA GeForce RTX 3060 Laptop (6GB)', vendor: 'nvidia', vramGB: 6, memoryBandwidthGBs: 336, category: 'mobile' },

  // Apple Silicon Unified Memory
  { id: 'apple-m3-max-64', name: 'Apple M3 / M4 Max (64GB Unified)', vendor: 'apple', vramGB: 48, memoryBandwidthGBs: 400, isUnifiedMemory: true, category: 'consumer' },
  { id: 'apple-m2-max-32', name: 'Apple M2 / M3 Max (36GB Unified)', vendor: 'apple', vramGB: 28, memoryBandwidthGBs: 300, isUnifiedMemory: true, category: 'consumer' },
  { id: 'apple-m3-pro-18', name: 'Apple M3 / M4 Pro (18GB/24GB Unified)', vendor: 'apple', vramGB: 16, memoryBandwidthGBs: 150, isUnifiedMemory: true, category: 'consumer' },
  { id: 'apple-m1-m2-16', name: 'Apple M1 / M2 / M3 (16GB Unified)', vendor: 'apple', vramGB: 12, memoryBandwidthGBs: 100, isUnifiedMemory: true, category: 'consumer' },
  { id: 'apple-m1-m2-8', name: 'Apple M1 / M2 (8GB Unified)', vendor: 'apple', vramGB: 5.5, memoryBandwidthGBs: 68, isUnifiedMemory: true, category: 'consumer' },

  // AMD
  { id: 'rx-7900-xtx', name: 'AMD Radeon RX 7900 XTX (24GB)', vendor: 'amd', vramGB: 24, memoryBandwidthGBs: 960, category: 'consumer' },
  { id: 'rx-7800-xt', name: 'AMD Radeon RX 7800 XT (16GB)', vendor: 'amd', vramGB: 16, memoryBandwidthGBs: 624, category: 'consumer' },
  { id: 'rx-6700-xt', name: 'AMD Radeon RX 6700 XT (12GB)', vendor: 'amd', vramGB: 12, memoryBandwidthGBs: 384, category: 'consumer' },

  // Intel & Integrated
  { id: 'intel-arc-a770', name: 'Intel Arc A770 (16GB)', vendor: 'intel', vramGB: 16, memoryBandwidthGBs: 560, category: 'consumer' },
  { id: 'cpu-integrated', name: 'CPU Only / Integrated Graphics (RAM Offload)', vendor: 'cpu', vramGB: 2, isUnifiedMemory: false, category: 'integrated' }
];

export const DEFAULT_HARDWARE_PROFILE: UserHardwareProfile = {
  gpu: POPULAR_GPUS.find(g => g.id === 'rtx-3060-12gb') || POPULAR_GPUS[5],
  systemRamGB: 32,
  occupiedRamGB: 8,
  operatingSystem: 'windows'
};
