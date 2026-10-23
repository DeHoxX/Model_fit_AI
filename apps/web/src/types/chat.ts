import { components } from '@/api/schema';

export type RecommendationCandidate = components['schemas']['RecommendationCandidate'];
export type EstimationResult = components['schemas']['EstimationResult'];

export interface ToolEvent {
  name: string;
  status: 'running' | 'completed';
}

export interface QuickReplyOption {
  id: string;
  label: string;
  actionValue: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolEvents?: ToolEvent[];
  recommendations?: RecommendationCandidate[];
  isStreaming?: boolean;
  error?: string;
  quickReplies?: QuickReplyOption[];
}

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  hardwareProfile?: Record<string, unknown>;
}
