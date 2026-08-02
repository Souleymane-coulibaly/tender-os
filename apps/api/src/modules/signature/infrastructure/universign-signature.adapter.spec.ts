import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UniversignSignatureAdapter } from "./universign-signature.adapter";
import type { LoadedSignatureConfig } from "./signature-config";

const CONFIG: NonNullable<LoadedSignatureConfig["universign"]> = {
  apiKey: "test-api-key-never-real",
  apiBaseUrl: "https://api.alpha.universign.com",
  environment: "ALPHA",
  returnUrl: "https://tenderos.example.com/return",
  cancelUrl: "https://tenderos.example.com/cancel",
  jwksUrl: "https://api.alpha.universign.com/v1/webhooks/jwks.json",
  requestTimeoutMs: 5000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/**
 * Mission Sprint 8A/8A bis (audit de correction) — tests CONTRACTUELS : vérifient que l'adapter
 * construit la BONNE requête HTTP (méthode, URL, en-têtes, forme du corps) exactement comme
 * documenté par apps.universign.com (voir la docstring de l'adapter pour les citations), en
 * interceptant `fetch` — JAMAIS un appel réseau réel, JAMAIS Universign réel. Ces tests prouvent
 * la forme de la requête ENVOYÉE, pas la réponse d'un vrai serveur (impossible sans accès Alpha
 * réel — voir BLOCKED_BY_UNIVERSIGN_ACCESS).
 */
describe("UniversignSignatureAdapter (contractuel — fetch intercepté, jamais Universign réel)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createTransaction: POST form-encoded to /v1/transactions with a Bearer header and a name field", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: "tx_123" }));
    const adapter = new UniversignSignatureAdapter(CONFIG);

    const result = await adapter.createTransaction({ organizationId: "org-1", localTransactionId: "local-tx-1" });

    expect(result).toEqual({ providerTransactionId: "tx_123" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.alpha.universign.com/v1/transactions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-api-key-never-real");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init.body).toBe("name=local-tx-1");
  });

  it("uploadDocument: step 1 is a REAL multipart/form-data upload with a 'file' field, never JSON/base64", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: "file_abc" })).mockResolvedValueOnce(jsonResponse({ id: "doc_xyz" }));
    const adapter = new UniversignSignatureAdapter(CONFIG);

    const result = await adapter.uploadDocument({ providerTransactionId: "tx_123", fileName: "memoire.pdf", content: Buffer.from("%PDF-1.4 test"), mimeType: "application/pdf" });

    expect(result).toEqual({ providerDocumentId: "doc_xyz" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const [uploadUrl, uploadInit] = fetchSpy.mock.calls[0]!;
    expect(uploadUrl).toBe("https://api.alpha.universign.com/v1/files");
    expect(uploadInit.method).toBe("POST");
    // Jamais de Content-Type manuel sur un FormData — fetch calcule seul la frontière multipart.
    expect(uploadInit.headers["Content-Type"]).toBeUndefined();
    expect(uploadInit.body).toBeInstanceOf(FormData);
    const uploadedFile = (uploadInit.body as FormData).get("file");
    expect(uploadedFile).toBeInstanceOf(Blob);
    expect((uploadedFile as File).name).toBe("memoire.pdf");
  });

  it("uploadDocument: step 2 attaches with the confirmed field name 'document' (never 'fileId'), form-encoded", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: "file_abc" })).mockResolvedValueOnce(jsonResponse({ id: "doc_xyz" }));
    const adapter = new UniversignSignatureAdapter(CONFIG);

    await adapter.uploadDocument({ providerTransactionId: "tx_123", fileName: "memoire.pdf", content: Buffer.from("test"), mimeType: "application/pdf" });

    const [attachUrl, attachInit] = fetchSpy.mock.calls[1]!;
    expect(attachUrl).toBe("https://api.alpha.universign.com/v1/transactions/tx_123/documents");
    expect(attachInit.method).toBe("POST");
    expect(attachInit.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(attachInit.body).toBe("document=file_abc");
  });

  it("addParticipant: form-encoded with the confirmed fields email/full_name/min_signature_level (lowercase levelN)/invitation_redirect_url", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: "participant_1" }));
    const adapter = new UniversignSignatureAdapter(CONFIG);

    const result = await adapter.addParticipant({
      providerTransactionId: "tx_123",
      providerDocumentId: "doc_xyz",
      firstName: "Alice",
      lastName: "Dupont",
      email: "alice.dupont@example.com",
      level: "LEVEL2",
      sequence: 1,
      invitationRedirectUrl: "https://tenderos.example.com/return",
    });

    expect(result).toEqual({ providerParticipantId: "participant_1" });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.alpha.universign.com/v1/transactions/tx_123/participants");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("email")).toBe("alice.dupont@example.com");
    expect(body.get("full_name")).toBe("Alice Dupont");
    expect(body.get("min_signature_level")).toBe("level2");
    expect(body.get("invitation_redirect_url")).toBe("https://tenderos.example.com/return");
  });

  it("startTransaction: POST with no body to /v1/transactions/{id}/start", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const adapter = new UniversignSignatureAdapter(CONFIG);

    await adapter.startTransaction({ providerTransactionId: "tx_123" });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.alpha.universign.com/v1/transactions/tx_123/start");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("");
  });

  it("getTransaction: GET request, maps the real status field", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: "tx_123", status: "started" }));
    const adapter = new UniversignSignatureAdapter(CONFIG);

    const result = await adapter.getTransaction({ providerTransactionId: "tx_123" });

    expect(result).toEqual({ providerTransactionId: "tx_123", status: "STARTED" });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.alpha.universign.com/v1/transactions/tx_123");
    expect(init.method).toBe("GET");
  });

  it("refuses to construct against a Production base URL, even if somehow passed", () => {
    expect(
      () =>
        new UniversignSignatureAdapter({
          ...CONFIG,
          apiBaseUrl: "https://api.universign.com",
        }),
    ).toThrow(/production/i);
  });

  it("never sends the API key or a full payload in a thrown error message", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("secret-server-detail", { status: 500 }));
    const adapter = new UniversignSignatureAdapter(CONFIG);

    await expect(adapter.createTransaction({ organizationId: "org-1", localTransactionId: "local-tx-1" })).rejects.toThrow(/^Universign API request failed with status 500$/);
  });
});
