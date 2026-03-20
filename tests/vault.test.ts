import { describe, it, expect, vi, beforeEach } from "vitest";
import { KovaMind } from "../src/client";

function mockFetch(data: any, status = 200) {
    return vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 400,
        status,
        headers: new Headers(),
        json: () => Promise.resolve(data),
        text: () => Promise.resolve(JSON.stringify(data)),
    });
}

describe("Vault v2", () => {
    let client: KovaMind;

    beforeEach(() => {
        client = new KovaMind({ apiKey: "km_test_xxx" });
    });

    it("vaultSetup returns recovery words", async () => {
        global.fetch = mockFetch({ status: "created", recovery_words: Array(12).fill("word") });
        const result = await client.vaultSetup("strongpass");
        expect(result.status).toBe("created");
        expect(result.recovery_words).toHaveLength(12);
    });

    it("vaultUnlock success", async () => {
        global.fetch = mockFetch({ status: "unlocked" });
        const result = await client.vaultUnlock("strongpass");
        expect(result.status).toBe("unlocked");
    });

    it("vaultLock success", async () => {
        global.fetch = mockFetch({ status: "locked" });
        const result = await client.vaultLock();
        expect(result.status).toBe("locked");
    });

    it("vaultStore returns handle", async () => {
        global.fetch = mockFetch({ handle: "h".repeat(32), label: "Key" });
        const result = await client.vaultStore({ label: "Key", schemaType: "api_key", fields: { key: "sk-test" } });
        expect(result.handle).toBeDefined();
        expect(JSON.stringify(result)).not.toContain("sk-test");
    });

    it("vaultList returns metadata no values", async () => {
        global.fetch = mockFetch({ credentials: [{ id: "c1", label: "Key", schema_type: "api_key", tags: null, created_at: "2026-01-01" }] });
        const result = await client.vaultList();
        expect(result).toHaveLength(1);
        expect(result[0].label).toBe("Key");
    });

    it("vaultDelete success", async () => {
        global.fetch = mockFetch({ status: "deleted", id: "c1" });
        const result = await client.vaultDelete("c1");
        expect(result.status).toBe("deleted");
    });

    it("vaultHandles returns labels only", async () => {
        global.fetch = mockFetch({ handles: [{ handle: "h".repeat(32), label: "Key", schema_type: "api_key" }] });
        const result = await client.vaultHandles();
        expect(result).toHaveLength(1);
        expect(Object.keys(result[0]).sort()).toEqual(["handle", "label", "schema_type"]);
    });

    it("vaultExecute returns result not credential", async () => {
        global.fetch = mockFetch({ success: true, output: "OK", error: null, status_code: 200 });
        const result = await client.vaultExecute({ handle: "h".repeat(32), action: "http_request", target: "https://api.example.com" });
        expect(result.success).toBe(true);
        expect(result.output).toBe("OK");
    });

    it("vaultExecute error no credential leak", async () => {
        global.fetch = mockFetch({ success: false, output: "", error: "ConnectionError", status_code: null });
        const result = await client.vaultExecute({ handle: "h".repeat(32), action: "http_request", target: "https://bad.com" });
        expect(result.success).toBe(false);
        expect(JSON.stringify(result).toLowerCase()).not.toContain("password");
    });

    it("vaultRecover success", async () => {
        global.fetch = mockFetch({ status: "recovered", recovery_words: Array(12).fill("new") });
        const result = await client.vaultRecover({ words: Array(12).fill("word"), newPassphrase: "newstrong" });
        expect(result.status).toBe("recovered");
        expect(result.recovery_words).toHaveLength(12);
    });

    it("vaultHandles response has no secret keys", async () => {
        global.fetch = mockFetch({ handles: [{ handle: "h".repeat(32), label: "Key", schema_type: "api_key" }] });
        const result = await client.vaultHandles();
        const keys = Object.keys(result[0]);
        expect(keys).not.toContain("password");
        expect(keys).not.toContain("secret");
        expect(keys).not.toContain("value");
    });

    it("vaultFind returns matches", async () => {
        global.fetch = mockFetch({ results: [{ handle: "h1", label: "GitHub", schema_type: "username_password", score: 0.95 }] });
        const result = await client.vaultFind("GitHub");
        expect(result).toHaveLength(1);
        expect(result[0].label).toBe("GitHub");
    });
});
