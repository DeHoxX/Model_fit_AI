import { AIModelSpec } from './models';
import { UserHardwareProfile, MemoryCalculationResult } from './hardware';

export interface QuickReplyOption {
  id: string;
  label: string;
  actionValue: string;
  category?: 'gpu' | 'goal' | 'preference' | 'action';
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  quickReplies?: QuickReplyOption[];
  detectedHardware?: Partial<UserHardwareProfile>;
  recommendationPreview?: {
    model: AIModelSpec;
    calcResult: MemoryCalculationResult;
  };
}

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  hardwareProfile?: UserHardwareProfile;
}
