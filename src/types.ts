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

// Vault v2 types
export interface VaultSetupResult {
    status: string;
    recovery_words: string[];
}

export interface VaultStoreParams {
    label: string;
    schemaType: string;
    fields: Record<string, string>;
    tags?: string;
}

export interface VaultStoreResult {
    handle: string;
    label: string;
}

export interface VaultHandle {
    handle: string;
    label: string;
    schema_type: string;
}

export interface VaultCredentialMeta {
    id: string;
    label: string;
    schema_type: string;
    tags: string | null;
    created_at: string;
}

export interface VaultExecuteParams {
    handle: string;
    action: string;
    target: string;
    mapping?: Record<string, string>;
}

export interface VaultExecuteResult {
    success: boolean;
    output: string;
    error: string | null;
    status_code: number | null;
}

export interface VaultRecoverParams {
    words: string[];
    newPassphrase: string;
}
