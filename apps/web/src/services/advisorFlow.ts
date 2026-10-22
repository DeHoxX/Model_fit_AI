import { ChatMessage, QuickReplyOption } from '../types/chat';
import { UserHardwareProfile } from '../types/hardware';
import { AIModelSpec } from '../types/models';
import { POPULAR_GPUS } from './hardwareDatabase';
import { POPULAR_MODELS } from './modelDatabase';
import { calculateMemoryRequirements } from './calculationEngine';

export interface AdvisorStepResult {
  message: ChatMessage;
  updatedProfile?: Partial<UserHardwareProfile>;
  recommendationTarget?: {
    model: AIModelSpec;
    hardware: UserHardwareProfile;
  };
}

/**
 * Multi-turn conversational flow manager for LocalIQ.
 * Guides non-technical users step-by-step from their goal -> hardware -> recommendation report.
 */
export function processAdvisorMessage(
  userText: string,
  history: ChatMessage[],
  currentHardware: UserHardwareProfile
): AdvisorStepResult {
  const lower = userText.toLowerCase();
  const messageId = `ast-${Date.now()}`;

  // STEP 1: Detecting initial intent / task
  const isCoding = lower.includes('code') || lower.includes('python') || lower.includes('programming') || lower.includes('developer');
  const isWriting = lower.includes('write') || lower.includes('writing') || lower.includes('essay') || lower.includes('creative');
  const isLlama = lower.includes('llama');

  // Check if user specified a GPU in their message
  const detectedGpu = POPULAR_GPUS.find(gpu => {
    const cleanGpu = gpu.name.toLowerCase();
    return lower.includes(cleanGpu) ||
      (lower.includes('3060') && gpu.id === 'rtx-3060-12gb') ||
      (lower.includes('4090') && gpu.id === 'rtx-4090') ||
      (lower.includes('4080') && gpu.id === 'rtx-4080') ||
      (lower.includes('4070') && gpu.id.includes('4070')) ||
      (lower.includes('4060') && gpu.id.includes('4060')) ||
      (lower.includes('3070') && gpu.id.includes('3070')) ||
      (lower.includes('3090') && gpu.id.includes('3090')) ||
      (lower.includes('apple') || lower.includes('m1') || lower.includes('m2') || lower.includes('m3') || lower.includes('macbook'));
  });

  // If user already specified their GPU in this turn or previous turns
  const effectiveGpu = detectedGpu || currentHardware.gpu;
  const userHardware: UserHardwareProfile = {
    ...currentHardware,
    gpu: effectiveGpu
  };

  // Turn count
  const turnCount = history.filter(m => m.sender === 'user').length;

  // Scenario A: User answered preference (Speed vs Quality) or GPU was identified
  if (lower.includes('speed') || lower.includes('fast') || lower.includes('quality') || lower.includes('balance') || turnCount >= 2) {
    // Select best model based on GPU VRAM
    let recommendedModel: AIModelSpec;
    if (userHardware.gpu.vramGB >= 20) {
      recommendedModel = isCoding
        ? POPULAR_MODELS.find(m => m.id === 'qwen-2.5-coder-32b')!
        : POPULAR_MODELS.find(m => m.id === 'llama-3.3-70b')!;
    } else if (userHardware.gpu.vramGB >= 12) {
      recommendedModel = isCoding
        ? POPULAR_MODELS.find(m => m.id === 'qwen-2.5-coder-7b')!
        : POPULAR_MODELS.find(m => m.id === 'llama-3.1-8b')!;
    } else if (userHardware.gpu.vramGB >= 8) {
      recommendedModel = isCoding
        ? POPULAR_MODELS.find(m => m.id === 'qwen-2.5-coder-7b')!
        : POPULAR_MODELS.find(m => m.id === 'mistral-7b-instruct')!;
    } else {
      recommendedModel = POPULAR_MODELS.find(m => m.id === 'phi-3.5-mini')!;
    }

    const calcResult = calculateMemoryRequirements(
      recommendedModel,
      'Q4_K_M',
      8192,
      1,
      userHardware
    );

    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: `Based on your hardware (${userHardware.gpu.name} with ${userHardware.gpu.vramGB}GB VRAM), I have identified an ideal configuration for you:\n\n` +
          `• **Recommended Model**: ${recommendedModel.name} (${recommendedModel.displayParameters})\n` +
          `• **Quantization**: Q4_K_M (optimal balance between speed and precision)\n` +
          `• **Estimated Memory**: ${calcResult.totalRequiredVramGB}GB VRAM required (${calcResult.headroomGB > 0 ? `${calcResult.headroomGB}GB safe headroom` : 'fits snugly'})\n` +
          `• **Compatibility**: ${calcResult.statusLabel}\n\n` +
          `I have generated a detailed hardware compatibility report with alternative model comparisons and installation runtimes.`,
        timestamp: Date.now(),
        recommendationPreview: {
          model: recommendedModel,
          calcResult
        },
        quickReplies: [
          { id: 'view-report', label: 'View Full Recommendation Report →', actionValue: 'ACTION_VIEW_REPORT', category: 'action' },
          { id: 'try-advanced', label: 'Tweak in Advanced Options', actionValue: 'ACTION_VIEW_ADVANCED', category: 'action' },
          { id: 'diff-gpu', label: 'Check a different GPU', actionValue: 'What if I have an RTX 4070?', category: 'gpu' }
        ]
      },
      updatedProfile: userHardware,
      recommendationTarget: {
        model: recommendedModel,
        hardware: userHardware
      }
    };
  }

  // Scenario B: Hardware was mentioned or need hardware clarification
  if (detectedGpu) {
    const quickReplies: QuickReplyOption[] = [
      { id: 'pref-speed', label: 'Prioritize Speed', actionValue: 'I prioritize response speed and lower latency.', category: 'preference' },
      { id: 'pref-quality', label: 'Coding Quality', actionValue: 'I prioritize maximum coding quality and deeper reasoning.', category: 'preference' },
      { id: 'pref-balanced', label: 'Balanced Performance', actionValue: 'I want a balanced configuration for everyday use.', category: 'preference' }
    ];

    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: `Got it! An **${detectedGpu.name}** equipped with **${detectedGpu.vramGB}GB VRAM** is a fantastic setup for local AI.\n\n` +
          `To tailor the recommendation: do you prefer blazing fast output speed (ideal for autocomplete and instant answers), or maximum reasoning quality for complex tasks?`,
        timestamp: Date.now(),
        quickReplies
      },
      updatedProfile: userHardware
    };
  }

  // Scenario C: Initial turn asking for hardware
  const gpuReplies: QuickReplyOption[] = [
    { id: 'gpu-3060', label: 'NVIDIA RTX 3060 12GB', actionValue: 'I have an NVIDIA RTX 3060 12GB.', category: 'gpu' },
    { id: 'gpu-4070', label: 'NVIDIA RTX 4070 12GB', actionValue: 'I have an NVIDIA RTX 4070 12GB.', category: 'gpu' },
    { id: 'gpu-apple', label: 'Apple Silicon Mac (M1/M2/M3)', actionValue: 'I am on an Apple Silicon Mac with 16GB memory.', category: 'gpu' },
    { id: 'gpu-none', label: "I don't have a dedicated GPU", actionValue: 'I only have integrated graphics / CPU.', category: 'gpu' },
    { id: 'gpu-help', label: 'Help me identify my hardware', actionValue: 'How do I check my GPU and VRAM in Windows?', category: 'gpu' }
  ];

  return {
    message: {
      id: messageId,
      sender: 'assistant',
      text: isCoding
        ? `Running local coding assistants gives you complete code privacy and zero API bills! To recommend the right model size, **which graphics card (GPU) or computer do you have?**`
        : isLlama
        ? `Llama is an incredible model family! Whether you can run the compact 8B or the massive 70B depends directly on your GPU VRAM. **Do you know what GPU is in your computer?**`
        : isWriting
        ? `For long-form writing and research, we want a model with high coherence and a generous context window. **Which GPU and how much RAM does your machine have?**`
        : `Sure! I will guide you to the perfect local model. To check what will fit comfortably, **do you know which graphics card (GPU) your computer has?**`,
      timestamp: Date.now(),
      quickReplies: gpuReplies
    }
  };
}
