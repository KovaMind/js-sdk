import {
  AuthError,
  KovaMindError,
  NotFoundError,
  RateLimitError,
  ServerError,
} from "./errors";
import type {
  EmotionalContext,
  ExtractParams,
  ExtractResult,
  HealthStatus,
  Pattern,
  RecallParams,
  RecallResult,
  ReinforceParams,
  ReinforcementResult,
  SurpriseParams,
  SurpriseResult,
  VaultSetupResult,
  VaultStoreParams,
  VaultStoreResult,
  VaultCredentialMeta,
  VaultHandle,
  VaultExecuteParams,
  VaultExecuteResult,
  VaultRecoverParams,
} from "./types";

const DEFAULT_BASE_URL = "https://api.kovamind.ai";
const DEFAULT_TIMEOUT = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

export interface KovaMindConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export class KovaMind {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(config: KovaMindConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  async extract(params: ExtractParams): Promise<ExtractResult> {
    const body: Record<string, unknown> = {
      conversation: params.conversation,
      user_id: params.userId,
    };
    if (params.sessionId !== undefined) {
      body.session_id = params.sessionId;
    }

    const data = await this.post("/memory/extract", body);
    return {
      patterns: parsePatterns(data.patterns ?? data.results ?? []),
      raw: data,
    };
  }

  async recall(params: RecallParams): Promise<RecallResult> {
    const body: Record<string, unknown> = {
      context: params.context,
      user_id: params.userId,
      max_patterns: params.maxPatterns ?? 10,
      min_confidence: params.minConfidence ?? 0.3,
    };

    const data = await this.post("/memory/retrieve", body);
    return {
      patterns: parsePatterns(
        data.patterns ?? data.results ?? data.memories ?? []
      ),
      query: params.context,
      raw: data,
    };
  }

  async reinforce(params: ReinforceParams): Promise<ReinforcementResult> {
    const body: Record<string, unknown> = {
      pattern_id: params.patternId,
      reinforcement_type: params.reinforcementType,
    };
    if (params.context !== undefined) {
      body.context = params.context;
    }

    const data = await this.post("/memory/reinforce", body);
    return {
      patternId: (data.pattern_id as string) ?? params.patternId,
      reinforcementType: (data.type as string) ?? params.reinforcementType,
      success: (data.success as boolean) ?? true,
      raw: data,
    };
  }

  async surprise(params: SurpriseParams): Promise<SurpriseResult> {
    const data = await this.post("/memory/surprise", {
      content: params.content,
      user_id: params.userId,
    });
    return {
      score: (data.surprise_score as number) ?? (data.score as number) ?? 0,
      route: (data.route as SurpriseResult["route"]) ?? "update",
      content: (data.content as string) ?? params.content,
      raw: data,
    };
  }

  async context(params: { conversationId: string }): Promise<EmotionalContext> {
    const data = await this.get(
      `/memory/context?conversation_id=${encodeURIComponent(params.conversationId)}`
    );
    return {
      conversationId:
        (data.conversation_id as string) ?? params.conversationId,
      emotions: (data.emotions as Record<string, number>) ?? {},
      dominantEmotion: (data.dominant_emotion as string) ?? "",
      sentiment: (data.sentiment as string) ?? "neutral",
      raw: data,
    };
  }

  async health(): Promise<HealthStatus> {
    const data = await this.get("/health");
    return {
      status: (data.status as string) ?? "unknown",
      version: (data.version as string) ?? "",
      raw: data,
    };
  }

  async vaultSetup(passphrase: string): Promise<VaultSetupResult> {
    return this.post("/vault/v2/setup", { passphrase });
  }

  async vaultUnlock(passphrase: string): Promise<{ status: string }> {
    return this.post("/vault/v2/unlock", { passphrase });
  }

  async vaultLock(): Promise<{ status: string }> {
    return this.post("/vault/v2/lock", {});
  }

  async vaultStore(params: VaultStoreParams): Promise<VaultStoreResult> {
    const body: Record<string, unknown> = {
      label: params.label,
      schema_type: params.schemaType,
      fields: params.fields,
    };
    if (params.tags !== undefined) body.tags = params.tags;
    return this.post("/vault/v2/credentials", body);
  }

  async vaultList(): Promise<VaultCredentialMeta[]> {
    const data = await this.get("/vault/v2/credentials");
    return (data.credentials ?? []) as VaultCredentialMeta[];
  }

  async vaultDelete(credentialId: string): Promise<{ status: string; id: string }> {
    return this.delete(`/vault/v2/credentials/${encodeURIComponent(credentialId)}`);
  }

  async vaultHandles(): Promise<VaultHandle[]> {
    const data = await this.get("/vault/v2/handles");
    return (data.handles ?? []) as VaultHandle[];
  }

  async vaultExecute(params: VaultExecuteParams): Promise<VaultExecuteResult> {
    const body: Record<string, unknown> = {
      handle: params.handle,
      action: params.action,
      target: params.target,
    };
    if (params.mapping !== undefined) body.mapping = params.mapping;
    return this.post("/vault/v2/execute", body);
  }

  async vaultRecover(params: VaultRecoverParams): Promise<VaultSetupResult> {
    return this.post("/vault/v2/recover", {
      words: params.words,
      new_passphrase: params.newPassphrase,
    });
  }

  private async post(
    path: string,
    body: Record<string, unknown>
  ): Promise<Record<string, any>> {
    return this.requestWithRetry("POST", path, body);
  }

  private async get(path: string): Promise<Record<string, any>> {
    return this.requestWithRetry("GET", path);
  }

  private async delete(path: string): Promise<Record<string, any>> {
    return this.requestWithRetry("DELETE", path);
  }

  private async requestWithRetry(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<Record<string, any>> {
    const url = `${this.baseUrl}${path}`;
    let delay = RETRY_BASE_DELAY;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      try {
        const init: RequestInit = {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          signal: controller.signal,
        };

        if (body !== undefined) {
          init.body = JSON.stringify(body);
        }

        let response: Response;
        try {
          response = await fetch(url, init);
        } catch (err: any) {
          if (err?.name === "AbortError") {
            throw new KovaMindError(
              `Request timed out after ${this.timeout}ms`,
              408
            );
          }
          throw new KovaMindError(
            `Network error: ${err?.message ?? "Unknown"}`,
            undefined
          );
        }

        if (response.status !== 429) {
          return this.handleResponse(response);
        }

        const retryAfterHeader = response.headers.get("Retry-After");
        const retryAfter = retryAfterHeader
          ? parseInt(retryAfterHeader, 10)
          : undefined;

        if (attempt < MAX_RETRIES - 1) {
          const sleepMs = Math.min(
            retryAfter !== undefined && !isNaN(retryAfter)
              ? retryAfter * 1000
              : delay,
            300_000 // cap at 5 minutes
          );
          await sleep(sleepMs);
          delay *= 2;
        } else {
          throw new RateLimitError(undefined, retryAfter);
        }
      } finally {
        clearTimeout(timer);
      }
    }

    throw new RateLimitError();
  }

  private async handleResponse(
    response: Response
  ): Promise<Record<string, any>> {
    if (response.status === 401) {
      throw new AuthError();
    }

    if (response.status === 404) {
      const data = await safeJson(response);
      throw new NotFoundError((data.detail as string) ?? "Resource not found");
    }

    if (response.status >= 500) {
      throw new ServerError(undefined, response.status);
    }

    if (!response.ok) {
      const data = await safeJson(response);
      const detail = (data.detail as string) ?? "Unknown error";
      throw new KovaMindError(detail, response.status);
    }

    return safeJson(response);
  }
}

function parsePatterns(raw: unknown[]): Pattern[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any) => {
    const { id, pattern, category, confidence, user_id, tenant_id, ...rest } =
      item;
    return {
      id: String(id ?? ""),
      pattern: pattern ?? "",
      category: category ?? "",
      confidence: Number(confidence ?? 1),
      user_id: user_id ?? "",
      tenant_id: tenant_id ?? "",
      metadata: rest,
    };
  });
}

async function safeJson(response: Response): Promise<Record<string, any>> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
