import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KovaMind } from "../src/client";
import {
  AuthError,
  KovaMindError,
  RateLimitError,
  NotFoundError,
  ServerError,
} from "../src/errors";

const BASE_URL = "https://api.kovamind.io";
const API_KEY = "km_live_testhex01";

let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

function mockFetch(
  responses: Array<{
    status: number;
    body?: any;
    headers?: Record<string, string>;
  }>
) {
  let callIndex = 0;
  return vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url: url as string, init });
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      headers: new Headers(resp.headers ?? {}),
      json: async () => resp.body ?? {},
      text: async () => JSON.stringify(resp.body ?? {}),
    } as Response;
  });
}

describe("KovaMind", () => {
  let kova: KovaMind;

  beforeEach(() => {
    kova = new KovaMind({ apiKey: API_KEY, baseUrl: BASE_URL });
    fetchCalls = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── extract ─────────────────────────────────────────────────────

  describe("extract", () => {
    it("returns patterns on success", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          {
            status: 200,
            body: {
              patterns: [
                { id: "1", pattern: "Prefers dark mode", category: "preference", confidence: 0.95, user_id: "alex", tenant_id: "t1" },
              ],
            },
          },
        ])
      );
      const result = await kova.extract({
        conversation: [{ role: "user", content: "I love dark mode" }],
        userId: "alex",
      });
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].pattern).toBe("Prefers dark mode");
      expect(result.patterns[0].confidence).toBe(0.95);
    });

    it("sends session_id when provided", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { patterns: [] } }]));
      await kova.extract({
        conversation: [],
        userId: "alex",
        sessionId: "sess-42",
      });
      const body = JSON.parse(fetchCalls[0].init?.body as string);
      expect(body.session_id).toBe("sess-42");
    });

    it("does not send session_id when undefined", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { patterns: [] } }]));
      await kova.extract({ conversation: [], userId: "alex" });
      const body = JSON.parse(fetchCalls[0].init?.body as string);
      expect(body.session_id).toBeUndefined();
    });

    it("returns empty patterns list", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { patterns: [] } }]));
      const result = await kova.extract({ conversation: [], userId: "alex" });
      expect(result.patterns).toHaveLength(0);
    });

    it("sends correct user_id in body", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { patterns: [] } }]));
      await kova.extract({ conversation: [], userId: "bob" });
      const body = JSON.parse(fetchCalls[0].init?.body as string);
      expect(body.user_id).toBe("bob");
    });

    it("throws AuthError on 401", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 401 }]));
      await expect(kova.extract({ conversation: [], userId: "alex" })).rejects.toThrow(AuthError);
    });

    it("throws RateLimitError after 3 retries on 429", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          { status: 429, headers: { "Retry-After": "1" } },
          { status: 429, headers: { "Retry-After": "1" } },
          { status: 429, headers: { "Retry-After": "1" } },
        ])
      );
      await expect(kova.extract({ conversation: [], userId: "alex" })).rejects.toThrow(RateLimitError);
    });

    it("retries on 429 then succeeds", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          { status: 429 },
          { status: 200, body: { patterns: [] } },
        ])
      );
      const result = await kova.extract({ conversation: [], userId: "alex" });
      expect(result.patterns).toHaveLength(0);
    });

    it("throws ServerError on 500", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 500 }]));
      await expect(kova.extract({ conversation: [], userId: "alex" })).rejects.toThrow(ServerError);
    });

    it("handles results key fallback", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([{ status: 200, body: { results: [{ id: "1", pattern: "via results" }] } }])
      );
      const result = await kova.extract({ conversation: [], userId: "alex" });
      expect(result.patterns[0].pattern).toBe("via results");
    });
  });

  // ── recall ──────────────────────────────────────────────────────

  describe("recall", () => {
    it("returns patterns on success", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          {
            status: 200,
            body: {
              patterns: [
                { id: "1", pattern: "Prefers dark mode", category: "preference", confidence: 0.9, user_id: "alex", tenant_id: "t1" },
              ],
            },
          },
        ])
      );
      const result = await kova.recall({ context: "what does alex like?", userId: "alex" });
      expect(result.patterns).toHaveLength(1);
      expect(result.query).toBe("what does alex like?");
    });

    it("returns empty patterns when none found", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { patterns: [] } }]));
      const result = await kova.recall({ context: "nothing", userId: "alex" });
      expect(result.patterns).toHaveLength(0);
    });

    it("sends custom maxPatterns and minConfidence", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { patterns: [] } }]));
      await kova.recall({ context: "test", userId: "alex", maxPatterns: 5, minConfidence: 0.8 });
      const body = JSON.parse(fetchCalls[0].init?.body as string);
      expect(body.max_patterns).toBe(5);
      expect(body.min_confidence).toBe(0.8);
    });

    it("uses defaults maxPatterns=10, minConfidence=0.3", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { patterns: [] } }]));
      await kova.recall({ context: "test", userId: "alex" });
      const body = JSON.parse(fetchCalls[0].init?.body as string);
      expect(body.max_patterns).toBe(10);
      expect(body.min_confidence).toBe(0.3);
    });

    it("handles memories key fallback", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([{ status: 200, body: { memories: [{ id: "1", pattern: "via memories" }] } }])
      );
      const result = await kova.recall({ context: "test", userId: "alex" });
      expect(result.patterns[0].pattern).toBe("via memories");
    });
  });

  // ── reinforce ───────────────────────────────────────────────────

  describe("reinforce", () => {
    it("returns success", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([{ status: 200, body: { pattern_id: "17", type: "confirmed", success: true } }])
      );
      const result = await kova.reinforce({ patternId: "17", reinforcementType: "confirmed" });
      expect(result.patternId).toBe("17");
      expect(result.success).toBe(true);
    });

    it("sends context when provided", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { success: true } }]));
      await kova.reinforce({ patternId: "17", reinforcementType: "confirmed", context: "User said so" });
      const body = JSON.parse(fetchCalls[0].init?.body as string);
      expect(body.context).toBe("User said so");
    });

    it("does not send context when undefined", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { success: true } }]));
      await kova.reinforce({ patternId: "17", reinforcementType: "confirmed" });
      const body = JSON.parse(fetchCalls[0].init?.body as string);
      expect(body.context).toBeUndefined();
    });

    it("throws NotFoundError on 404", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 404, body: { detail: "Pattern not found" } }]));
      await expect(
        kova.reinforce({ patternId: "999", reinforcementType: "confirmed" })
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── surprise ────────────────────────────────────────────────────

  describe("surprise", () => {
    it("returns score and route", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([{ status: 200, body: { surprise_score: 0.82, route: "contradict" } }])
      );
      const result = await kova.surprise({ content: "Alex prefers light mode", userId: "alex" });
      expect(result.score).toBe(0.82);
      expect(result.route).toBe("contradict");
    });

    it("handles score key fallback", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([{ status: 200, body: { score: 0.5, route: "update" } }])
      );
      const result = await kova.surprise({ content: "test", userId: "alex" });
      expect(result.score).toBe(0.5);
    });

    it("defaults route to update when missing", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([{ status: 200, body: { surprise_score: 0.3 } }])
      );
      const result = await kova.surprise({ content: "test", userId: "alex" });
      expect(result.route).toBe("update");
    });
  });

  // ── context ─────────────────────────────────────────────────────

  describe("context", () => {
    it("returns emotional context", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          {
            status: 200,
            body: {
              conversation_id: "conv-123",
              emotions: { joy: 0.8, curiosity: 0.6 },
              dominant_emotion: "joy",
              sentiment: "positive",
            },
          },
        ])
      );
      const result = await kova.context({ conversationId: "conv-123" });
      expect(result.conversationId).toBe("conv-123");
      expect(result.dominantEmotion).toBe("joy");
      expect(result.sentiment).toBe("positive");
      expect(result.emotions.joy).toBe(0.8);
    });

    it("encodes conversationId in URL", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: {} }]));
      await kova.context({ conversationId: "conv with spaces" });
      expect(fetchCalls[0].url).toContain("conv%20with%20spaces");
    });
  });

  // ── health ──────────────────────────────────────────────────────

  describe("health", () => {
    it("returns status and version", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([{ status: 200, body: { status: "ok", version: "1.0.0" } }])
      );
      const result = await kova.health();
      expect(result.status).toBe("ok");
      expect(result.version).toBe("1.0.0");
    });

    it("throws ServerError on 500", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 500 }]));
      await expect(kova.health()).rejects.toThrow(ServerError);
    });
  });

  // ── errors ──────────────────────────────────────────────────────

  describe("errors", () => {
    it("AuthError has statusCode 401", () => {
      const e = new AuthError();
      expect(e.statusCode).toBe(401);
      expect(e.name).toBe("AuthError");
    });

    it("RateLimitError stores retryAfter", () => {
      const e = new RateLimitError("limited", 60);
      expect(e.statusCode).toBe(429);
      expect(e.retryAfter).toBe(60);
    });

    it("NotFoundError includes detail message from API", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 404, body: { detail: "Custom not found" } }]));
      try {
        await kova.reinforce({ patternId: "1", reinforcementType: "confirmed" });
      } catch (err: any) {
        expect(err).toBeInstanceOf(NotFoundError);
        expect(err.message).toBe("Custom not found");
      }
    });

    it("ServerError preserves status code", () => {
      const e = new ServerError("bad", 503);
      expect(e.statusCode).toBe(503);
    });

    it("generic KovaMindError on unknown status like 422", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 422, body: { detail: "Validation failed" } }]));
      await expect(kova.extract({ conversation: [], userId: "alex" })).rejects.toThrow(KovaMindError);
    });

    it("all errors extend KovaMindError", () => {
      expect(new AuthError()).toBeInstanceOf(KovaMindError);
      expect(new RateLimitError()).toBeInstanceOf(KovaMindError);
      expect(new NotFoundError()).toBeInstanceOf(KovaMindError);
      expect(new ServerError()).toBeInstanceOf(KovaMindError);
    });
  });

  // ── timeout and network ─────────────────────────────────────────

  describe("timeout and network", () => {
    it("throws KovaMindError with timeout message on AbortError", async () => {
      const abortError = new DOMException("The operation was aborted", "AbortError");
      vi.stubGlobal("fetch", vi.fn(async () => { throw abortError; }));
      try {
        await kova.extract({ conversation: [], userId: "alex" });
      } catch (err: any) {
        expect(err).toBeInstanceOf(KovaMindError);
        expect(err.message).toContain("timed out");
        expect(err.statusCode).toBe(408);
      }
    });

    it("throws KovaMindError on network failure", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
      try {
        await kova.extract({ conversation: [], userId: "alex" });
      } catch (err: any) {
        expect(err).toBeInstanceOf(KovaMindError);
        expect(err.message).toContain("Network error");
      }
    });
  });

  // ── configuration ───────────────────────────────────────────────

  describe("configuration", () => {
    it("uses custom baseUrl", async () => {
      const custom = new KovaMind({ apiKey: API_KEY, baseUrl: "https://custom.example.com" });
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { status: "ok" } }]));
      await custom.health();
      expect(fetchCalls[0].url).toBe("https://custom.example.com/health");
    });

    it("strips trailing slashes from baseUrl", async () => {
      const custom = new KovaMind({ apiKey: API_KEY, baseUrl: "https://example.com///" });
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { status: "ok" } }]));
      await custom.health();
      expect(fetchCalls[0].url).toBe("https://example.com/health");
    });

    it("defaults to https://api.kovamind.io", async () => {
      const defaultKova = new KovaMind({ apiKey: API_KEY });
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { status: "ok" } }]));
      await defaultKova.health();
      expect(fetchCalls[0].url).toBe("https://api.kovamind.io/health");
    });

    it("sends Bearer token in Authorization header", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { status: "ok" } }]));
      await kova.health();
      const headers = fetchCalls[0].init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${API_KEY}`);
    });
  });
});
