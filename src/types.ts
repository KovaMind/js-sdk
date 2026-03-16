export interface Message {
  role: string;
  content: string;
}

export type ReinforcementType =
  | "confirmed"
  | "denied"
  | "strengthened"
  | "weakened";

export interface Pattern {
  id: string;
  pattern: string;
  category: string;
  confidence: number;
  user_id: string;
  tenant_id: string;
  metadata: Record<string, unknown>;
}

export interface ExtractParams {
  conversation: Message[];
  userId: string;
  sessionId?: string;
}

export interface ExtractResult {
  patterns: Pattern[];
  raw: Record<string, unknown>;
}

export interface RecallParams {
  context: string;
  userId: string;
  maxPatterns?: number;
  minConfidence?: number;
}

export interface RecallResult {
  patterns: Pattern[];
  query: string;
  raw: Record<string, unknown>;
}

export interface ReinforceParams {
  patternId: string;
  reinforcementType: ReinforcementType;
  context?: string;
}

export interface ReinforcementResult {
  patternId: string;
  reinforcementType: string;
  success: boolean;
  raw: Record<string, unknown>;
}

export interface SurpriseParams {
  content: string;
  userId: string;
}

export interface SurpriseResult {
  score: number;
  route: "reinforce" | "update" | "contradict";
  content: string;
  raw: Record<string, unknown>;
}

export interface EmotionalContext {
  conversationId: string;
  emotions: Record<string, number>;
  dominantEmotion: string;
  sentiment: string;
  raw: Record<string, unknown>;
}

export interface HealthStatus {
  status: string;
  version: string;
  raw: Record<string, unknown>;
}
