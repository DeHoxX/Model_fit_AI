export type QuantizationType =
  | 'Q2_K'
  | 'Q3_K_M'
  | 'Q4_K_M'
  | 'Q5_K_M'
  | 'Q6_K'
  | 'Q8_0'
  | 'FP16'
  | 'BF16';

export interface QuantizationOption {
  type: QuantizationType;
  label: string;
  bitsPerWeight: number;
  qualityRetention: string;
  recommended: boolean;
  description: string;
}

export type ModelTask = 'coding' | 'general' | 'writing' | 'research' | 'math' | 'vision';

export interface AIModelSpec {
  id: string;
  name: string;
  family: 'Llama' | 'Qwen' | 'DeepSeek' | 'Mistral' | 'Gemma' | 'Phi';
  parameterCountBillions: number;
  displayParameters: string;
  defaultContextLength: number;
  maxContextLength: number;
  supportedQuantizations: QuantizationType[];
  primaryTasks: ModelTask[];
  huggingFaceUrl?: string;
  description: string;
  recommendedFor: string;
  benchmarkScore?: number;
  speedRating: 'Fast' | 'Balanced' | 'Heavy';
}

export interface ModelConfiguration {
  modelId: string;
  quantization: QuantizationType;
  contextLength: number;
  batchSize: number;
  runtime: 'Ollama' | 'LM Studio' | 'vLLM' | 'llama.cpp' | 'ExLlamaV2';
}
