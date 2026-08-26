import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ProviderErrorCode } from "../domain/enums";
import { RemoteProviderError } from "../domain/errors";
import { callProviderJson } from "./provider-http-client";

const schema = z.object({ ok: z.boolean() });

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("callProviderJson", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Checkpoint TENDEROS-2.1-P2.3-E12.2 — `restoreAllMocks()` n'annule PAS `vi.stubGlobal` : ce
    // fichier remplaçait `globalThis.fetch` par un `vi.fn()` et le laissait en place pour TOUS les
    // fichiers exécutés ensuite dans le même process (`--poolOptions.forks.singleFork` partage
    // `globalThis`). Les specs d'intégration suivantes recevaient alors `undefined` de chaque appel
    // `fetch`, ce qui faisait surface en `Cannot read properties of undefined (reading 'json')` —
    // un échec attribué à tort à de l'instabilité de concurrence (`seat-limit-concurrency`).
    // Reproduit de façon déterministe : ce fichier suivi de ce spec suffisait à le déclencher.
    vi.unstubAllGlobals();
  });

  it("returns the parsed body on a 200 response without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callProviderJson("https://graph.example/x", schema, {}, "Test Provider");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("mission §23 — never retries a 403 (permanent error), fails on the first attempt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { error: "forbidden" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callProviderJson("https://graph.example/x", schema, {}, "Test Provider")).rejects.toMatchObject({
      providerErrorCode: ProviderErrorCode.PermissionDenied,
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("mission §18/§89 — a 429 with Retry-After is retried and eventually succeeds, honoring the header within the bounded cap", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: "rate limited" }, { "retry-after": "2" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = callProviderJson("https://graph.example/x", schema, {}, "Test Provider");
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("mission §23 — a 429 that never recovers fails as RATE_LIMITED after MAX_ATTEMPTS, never retried indefinitely", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, { error: "rate limited" }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = callProviderJson("https://graph.example/x", schema, {}, "Test Provider");
    const assertion = expect(promise).rejects.toMatchObject({ providerErrorCode: ProviderErrorCode.RateLimited, retryable: true });
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("mission §20 — a request that never resolves is aborted by the timeout and classified as TIMEOUT", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("This operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = callProviderJson("https://graph.example/x", schema, {}, "Test Provider");
    const assertion = expect(promise).rejects.toMatchObject({ providerErrorCode: ProviderErrorCode.Timeout, retryable: true });
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("BLOQUANT (correctif audit Codex P1-004) — retryAmbiguous:false never retries a network-level (ambiguous) failure, even on the very first attempt: a non-idempotent POST must never be silently duplicated by this client's own internal retry loop", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("This operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = callProviderJson("https://graph.example/x", schema, {}, "Test Provider", { retryAmbiguous: false });
    const assertion = expect(promise).rejects.toMatchObject({ providerErrorCode: ProviderErrorCode.Timeout, retryable: true, isAmbiguousOutcome: true });
    await vi.runAllTimersAsync();
    await assertion;

    // Une seule tentative — jamais un second appel réseau qui pourrait dupliquer une opération non
    // idempotente ayant potentiellement déjà atteint le provider lors de la première tentative.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("mission §23 — retryAmbiguous:false does NOT affect retries for a DEFINITE (status-derived) transient error — only the ambiguous/network-catch branch is disabled", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: "rate limited" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = callProviderJson("https://graph.example/x", schema, {}, "Test Provider", { retryAmbiguous: false });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("mission §84/§101 — never leaks the raw provider response body in the public error message, only in technicalDetail", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { secretInternalDetail: "do-not-leak-this-to-the-browser" }));
    vi.stubGlobal("fetch", fetchMock);

    let caught: unknown;
    try {
      await callProviderJson("https://graph.example/x", schema, {}, "Test Provider");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RemoteProviderError);
    const error = caught as RemoteProviderError;
    expect(error.message).not.toContain("do-not-leak-this-to-the-browser");
    expect(error.technicalDetail).toContain("do-not-leak-this-to-the-browser");
  });
});
