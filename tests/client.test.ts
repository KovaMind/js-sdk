import { describe, it, expect, vi, beforeEach } from "vitest";
import { KovaMind } from "../src/client";
import {
  AuthError,
  RateLimitError,
  NotFoundError,
  ServerError,
} from "../src/errors";

const BASE_URL = "https://api.kovamind.ai";
const API_KEY = "km_live_testhex01";

function mockFetch(
  responses: Array<{
    status: number;
    body?: any;
    headers?: Record<string, string>;
  }>
) {
  let callIndex = 0;
  return vi.fn(async () => {
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      headers: new Headers(resp.headers ?? {}),
      json: async () => resp.body ?? {},
    } as Response;
  });
}

describe("KovaMind", () => {
  let kova: KovaMind;

  beforeEach(() => {
    kova = new KovaMind({ apiKey: API_KEY, baseUrl: BASE_URL });
  });

  describe("extract", () => {
    it("returns patterns on success", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          {
            status: 200,
            body: {
              patterns: [
                {
                  id: "1",
                  pattern: "Prefers dark mode",
                  category: "preference",
                  confidence: 0.95,
                  user_id: "alex",
                  tenant_id: "t1",
                },
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

    it("throws AuthError on 401", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 401 }]));
      await expect(
        kova.extract({ conversation: [], userId: "alex" })
      ).rejects.toThrow(AuthError);
    });

    it("throws RateLimitError after retries on 429", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          { status: 429, headers: { "Retry-After": "1" } },
          { status: 429, headers: { "Retry-After": "1" } },
          { status: 429, headers: { "Retry-After": "1" } },
        ])
      );
      await expect(
        kova.extract({ conversation: [], userId: "alex" })
      ).rejects.toThrow(RateLimitError);
    });

    it("retries on 429 then succeeds", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          { status: 429 },
          { status: 200, body: { patterns: [] } },
        ])
      );
      const result = await kova.extract({
        conversation: [],
        userId: "alex",
      });
      expect(result.patterns).toHaveLength(0);
    });
  });

  describe("recall", () => {
    it("returns patterns on success", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          {
            status: 200,
            body: {
              patterns: [
                {
                  id: "1",
                  pattern: "Prefers dark mode",
                  category: "preference",
                  confidence: 0.9,
                  user_id: "alex",
                  tenant_id: "t1",
                },
              ],
            },
          },
        ])
      );

      const result = await kova.recall({
        context: "what does alex like?",
        userId: "alex",
      });
      expect(result.patterns).toHaveLength(1);
      expect(result.query).toBe("what does alex like?");
    });
  });

  describe("reinforce", () => {
    it("returns success", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          {
            status: 200,
            body: { pattern_id: "17", type: "confirmed", success: true },
          },
        ])
      );

      const result = await kova.reinforce({
        patternId: "17",
        reinforcementType: "confirmed",
      });
      expect(result.patternId).toBe("17");
      expect(result.success).toBe(true);
    });

    it("throws NotFoundError on 404", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          { status: 404, body: { detail: "Pattern not found" } },
        ])
      );
      await expect(
        kova.reinforce({ patternId: "999", reinforcementType: "confirmed" })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("surprise", () => {
    it("returns score and route", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          {
            status: 200,
            body: { surprise_score: 0.82, route: "contradict" },
          },
        ])
      );

      const result = await kova.surprise({
        content: "Alex prefers light mode",
        userId: "alex",
      });
      expect(result.score).toBe(0.82);
      expect(result.route).toBe("contradict");
    });
  });

  describe("health", () => {
    it("returns status", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([
          { status: 200, body: { status: "ok", version: "1.0.0" } },
        ])
      );

      const result = await kova.health();
      expect(result.status).toBe("ok");
      expect(result.version).toBe("1.0.0");
    });
  });

  describe("server error", () => {
    it("throws ServerError on 500", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 500 }]));
      await expect(
        kova.extract({ conversation: [], userId: "alex" })
      ).rejects.toThrow(ServerError);
    });
  });
});
