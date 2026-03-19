import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KovaMind } from "../src/client";

const BASE_URL = "https://api.kovamind.ai";
const API_KEY = "km_live_testvault";

let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

function mockFetch(responses: Array<{ status: number; body?: any }>) {
  let idx = 0;
  return vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    const resp = responses[idx] ?? responses[responses.length - 1];
    idx++;
    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      headers: new Headers(),
      json: async () => resp.body ?? {},
      text: async () => JSON.stringify(resp.body ?? {}),
    } as Response;
  });
}

describe("Vault", () => {
  let kova: KovaMind;
  beforeEach(() => {
    kova = new KovaMind({ apiKey: API_KEY, baseUrl: BASE_URL });
    fetchCalls = [];
  });
  afterEach(() => { vi.restoreAllMocks(); });

  describe("vaultStatus", () => {
    it("returns unlocked status", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { status: "unlocked" } }]));
      const result = await kova.vaultStatus();
      expect(result.status).toBe("unlocked");
    });

    it("returns locked status", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { status: "locked" } }]));
      const result = await kova.vaultStatus();
      expect(result.status).toBe("locked");
    });
  });

  describe("vaultStore", () => {
    it("stores a secret and returns id", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { id: "sec-42", label: "aws-key", hash: "abc123" } }]));
      const result = await kova.vaultStore({ agentId: "axiom", label: "aws-key", value: "AKIA..." });
      expect(result.id).toBe("sec-42");
      expect(result.label).toBe("aws-key");
    });

    it("sends agent_id in body", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { id: "1", label: "x", hash: "h" } }]));
      await kova.vaultStore({ agentId: "axiom", label: "x", value: "v" });
      const body = JSON.parse(fetchCalls[0].init?.body as string);
      expect(body.agent_id).toBe("axiom");
    });

    it("sends tags when provided", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { id: "1", label: "x", hash: "h" } }]));
      await kova.vaultStore({ agentId: "axiom", label: "x", value: "v", tags: "cloud,aws" });
      const body = JSON.parse(fetchCalls[0].init?.body as string);
      expect(body.tags).toBe("cloud,aws");
    });

    it("does not send tags when undefined", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { id: "1", label: "x", hash: "h" } }]));
      await kova.vaultStore({ agentId: "axiom", label: "x", value: "v" });
      const body = JSON.parse(fetchCalls[0].init?.body as string);
      expect(body.tags).toBeUndefined();
    });
  });

  describe("vaultGet", () => {
    it("retrieves a decrypted secret", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { id: "sec-42", value: "AKIA12345" } }]));
      const result = await kova.vaultGet({ agentId: "axiom", secretId: "sec-42" });
      expect(result.value).toBe("AKIA12345");
    });

    it("URL-encodes secretId", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { id: "1", value: "x" } }]));
      await kova.vaultGet({ agentId: "axiom", secretId: "../../admin" });
      expect(fetchCalls[0].url).toContain(encodeURIComponent("../../admin"));
      expect(fetchCalls[0].url).not.toContain("../../admin");
    });

    it("includes agent_id in query", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { id: "1", value: "x" } }]));
      await kova.vaultGet({ agentId: "axiom", secretId: "sec-1" });
      expect(fetchCalls[0].url).toContain("agent_id=axiom");
    });
  });

  describe("vaultList", () => {
    it("lists secrets without values", async () => {
      vi.stubGlobal("fetch", mockFetch([{
        status: 200,
        body: {
          secrets: [
            { id: "sec-1", label: "aws-key", tags: "cloud", created_at: "2026-03-19" },
            { id: "sec-2", label: "db-pass", tags: null, created_at: "2026-03-19" },
          ],
        },
      }]));
      const result = await kova.vaultList({ agentId: "axiom" });
      expect(result.secrets).toHaveLength(2);
      expect(result.secrets[0].label).toBe("aws-key");
    });

    it("returns empty list", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { secrets: [] } }]));
      const result = await kova.vaultList({ agentId: "axiom" });
      expect(result.secrets).toHaveLength(0);
    });
  });

  describe("vaultDelete", () => {
    it("destroys a secret", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { status: "destroyed", destroyed: true } }]));
      const result = await kova.vaultDelete({ agentId: "axiom", secretId: "sec-42" });
      expect(result.destroyed).toBe(true);
    });

    it("handles not found", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { status: "not_found", destroyed: false } }]));
      const result = await kova.vaultDelete({ agentId: "axiom", secretId: "nope" });
      expect(result.destroyed).toBe(false);
    });

    it("URL-encodes secretId to prevent path traversal", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { destroyed: true } }]));
      await kova.vaultDelete({ agentId: "axiom", secretId: "../../../etc/passwd" });
      expect(fetchCalls[0].url).toContain(encodeURIComponent("../../../etc/passwd"));
      expect(fetchCalls[0].url).not.toContain("../");
    });
  });
});
