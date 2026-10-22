import { AIModelSpec, QuantizationOption } from '../types/models';

export const QUANTIZATION_OPTIONS: QuantizationOption[] = [
  {
    type: 'Q4_K_M',
    label: 'Q4_K_M (4-bit Medium)',
    bitsPerWeight: 4.5,
    qualityRetention: '98.5% of FP16',
    recommended: true,
    description: 'Gold standard for local inference. Drastic VRAM reduction with negligible perplexity loss.'
  },
  {
    type: 'Q5_K_M',
    label: 'Q5_K_M (5-bit Medium)',
    bitsPerWeight: 5.5,
    qualityRetention: '99.4% of FP16',
    recommended: false,
    description: 'Slightly higher quality for complex logic and math; requires ~20% more VRAM.'
  },
  {
    type: 'Q8_0',
    label: 'Q8_0 (8-bit High Precision)',
    bitsPerWeight: 8.5,
    qualityRetention: '99.9% of FP16',
    recommended: false,
    description: 'Near-lossless reproduction of 16-bit float. Ideal when ample VRAM is available.'
  },
  {
    type: 'Q3_K_M',
    label: 'Q3_K_M (3-bit Medium)',
    bitsPerWeight: 3.5,
    qualityRetention: '93.0% of FP16',
    recommended: false,
    description: 'Aggressive compression to fit larger parameter models into restricted VRAM.'
  },
  {
    type: 'FP16',
    label: 'FP16 (16-bit Unquantized)',
    bitsPerWeight: 16.0,
    qualityRetention: '100% (Baseline)',
    recommended: false,
    description: 'Raw model weights without quantization. Demands 3.5x more VRAM than 4-bit.'
  }
];

export const POPULAR_MODELS: AIModelSpec[] = [
  {
    id: 'qwen-2.5-coder-7b',
    name: 'Qwen 2.5 Coder 7B',
    family: 'Qwen',
    parameterCountBillions: 7.6,
    displayParameters: '7.6B Parameters',
    defaultContextLength: 8192,
    maxContextLength: 131072,
    supportedQuantizations: ['Q4_K_M', 'Q5_K_M', 'Q8_0', 'FP16'],
    primaryTasks: ['coding', 'general', 'math'],
    description: 'State-of-the-art coding model that outperforms larger 34B models on HumanEval and real-world repository tasks.',
    recommendedFor: 'Python, TypeScript, full-stack coding, and CLI debugging on consumer GPUs.',
    benchmarkScore: 88.4,
    speedRating: 'Fast'
  },
  {
    id: 'deepseek-coder-16b',
    name: 'DeepSeek Coder 16B',
    family: 'DeepSeek',
    parameterCountBillions: 16.0,
    displayParameters: '16.0B Parameters',
    defaultContextLength: 8192,
    maxContextLength: 65536,
    supportedQuantizations: ['Q3_K_M', 'Q4_K_M', 'Q5_K_M', 'Q8_0'],
    primaryTasks: ['coding', 'math'],
    description: 'DeepSeek’s dedicated code reasoning engine trained on 2+ trillion code and natural language tokens.',
    recommendedFor: 'Complex algorithmic development, refactoring, and project architecture.',
    benchmarkScore: 86.2,
    speedRating: 'Balanced'
  },
  {
    id: 'mistral-7b-instruct',
    name: 'Mistral 7B Instruct v0.3',
    family: 'Mistral',
    parameterCountBillions: 7.2,
    displayParameters: '7.2B Parameters',
    defaultContextLength: 8192,
    maxContextLength: 32768,
    supportedQuantizations: ['Q4_K_M', 'Q5_K_M', 'Q8_0', 'FP16'],
    primaryTasks: ['general', 'writing', 'research'],
    description: 'The community favorite lightweight generalist model. Excellent conversational tone and function calling.',
    recommendedFor: 'Creative writing, technical documentation, and general-purpose local assistance.',
    benchmarkScore: 81.5,
    speedRating: 'Fast'
  },
  {
    id: 'llama-3.1-8b',
    name: 'Llama 3.1 8B Instruct',
    family: 'Llama',
    parameterCountBillions: 8.0,
    displayParameters: '8.0B Parameters',
    defaultContextLength: 8192,
    maxContextLength: 131072,
    supportedQuantizations: ['Q4_K_M', 'Q5_K_M', 'Q8_0', 'FP16'],
    primaryTasks: ['general', 'coding', 'research', 'writing'],
    description: 'Meta’s flagship compact LLM with native 128K context window support and remarkable multilingual capability.',
    recommendedFor: 'Long-document analysis, multilingual tasks, and everyday desktop AI workflows.',
    benchmarkScore: 84.1,
    speedRating: 'Fast'
  },
  {
    id: 'qwen-2.5-coder-32b',
    name: 'Qwen 2.5 Coder 32B',
    family: 'Qwen',
    parameterCountBillions: 32.5,
    displayParameters: '32.5B Parameters',
    defaultContextLength: 8192,
    maxContextLength: 131072,
    supportedQuantizations: ['Q3_K_M', 'Q4_K_M', 'Q5_K_M'],
    primaryTasks: ['coding', 'math', 'research'],
    description: 'Near-Claude-3.5-Sonnet level code generation capabilities in a locally runnable weights package.',
    recommendedFor: 'Enterprise-grade code generation on 24GB GPUs (RTX 3090/4090) or Apple Silicon Mac.',
    benchmarkScore: 92.7,
    speedRating: 'Heavy'
  },
  {
    id: 'llama-3.3-70b',
    name: 'Llama 3.3 70B Instruct',
    family: 'Llama',
    parameterCountBillions: 70.6,
    displayParameters: '70.6B Parameters',
    defaultContextLength: 4096,
    maxContextLength: 131072,
    supportedQuantizations: ['Q2_K', 'Q3_K_M', 'Q4_K_M'],
    primaryTasks: ['research', 'coding', 'general', 'math'],
    description: 'Top-tier frontier open weights model delivering GPT-4o caliber reasoning and nuance.',
    recommendedFor: 'Deep research, complex multi-turn reasoning, and high-stakes analytical tasks.',
    benchmarkScore: 94.2,
    speedRating: 'Heavy'
  },
  {
    id: 'phi-3.5-mini',
    name: 'Phi-3.5 Mini (3.8B)',
    family: 'Phi',
    parameterCountBillions: 3.8,
    displayParameters: '3.8B Parameters',
    defaultContextLength: 4096,
    maxContextLength: 131072,
    supportedQuantizations: ['Q4_K_M', 'Q8_0', 'FP16'],
    primaryTasks: ['coding', 'math', 'general'],
    description: 'Microsoft’s ultra-compact powerhouse trained on synthetic textbooks. Runs on virtually any laptop.',
    recommendedFor: 'Laptops with 4GB - 6GB VRAM, low-power systems, and ultra-fast inference.',
    benchmarkScore: 78.9,
    speedRating: 'Fast'
  }
];
