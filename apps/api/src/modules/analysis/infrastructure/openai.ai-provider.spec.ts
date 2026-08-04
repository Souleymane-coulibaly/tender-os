import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiInvalidResponseError, AiProviderUnavailableError } from "../domain/errors";
import type { AIProviderRequest } from "../application/ports/ai-provider";
import { OpenAiProvider } from "./openai.ai-provider";
import { STRICT_OUTPUT_SCHEMAS, documentAnalysisJsonSchema, tenderConsolidationJsonSchema } from "./strict-output-schemas";

function fakeSuccessResponse(content: string): Response {
  return new Response(
    JSON.stringify({ id: "req-1", choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function baseRequest(overrides: Partial<AIProviderRequest> = {}): AIProviderRequest {
  return {
    model: "gpt-4o-mini",
    systemPrompt: "system",
    userPrompt: "user",
    responseSchemaName: "free_text",
    timeoutMs: 5000,
    ...overrides,
  };
}

/**
 * Mission — "ne jamais activer le mode strict par défaut" : ces tests prouvent que SEULS les deux
 * noms de la liste blanche déclenchent le mode Structured Outputs strict ; tout le reste
 * (`"free_text"`, absent, inconnu) envoie EXACTEMENT le même payload qu'avant ce correctif — jamais
 * un changement implicite pour `generation`/`ai-benchmark`, qui réutilisent ce même adaptateur sans
 * jamais passer par ce test (ils utilisent `FakeAIProvider`, jamais `OpenAiProvider` réel).
 */
describe("OpenAiProvider — liste blanche Structured Outputs strict", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async () => fakeSuccessResponse('{"ok":true}'));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sentBody(): Record<string, unknown> {
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    return JSON.parse(init.body as string);
  }

  it("activates strict Structured Outputs for DocumentAnalysisOutputSchema", async () => {
    await new OpenAiProvider("key").complete(baseRequest({ responseSchemaName: "DocumentAnalysisOutputSchema" }));

    expect(sentBody().response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "DocumentAnalysisOutputSchema", strict: true, schema: documentAnalysisJsonSchema },
    });
  });

  it("activates strict Structured Outputs for TenderConsolidationOutputSchema", async () => {
    await new OpenAiProvider("key").complete(baseRequest({ responseSchemaName: "TenderConsolidationOutputSchema" }));

    expect(sentBody().response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "TenderConsolidationOutputSchema", strict: true, schema: tenderConsolidationJsonSchema },
    });
  });

  it("keeps the unchanged json_object behavior for 'free_text' (generation module default)", async () => {
    await new OpenAiProvider("key").complete(baseRequest({ responseSchemaName: "free_text" }));

    expect(sentBody().response_format).toEqual({ type: "json_object" });
  });

  it("keeps the unchanged json_object behavior for an unrecognized responseSchemaName — never an implicit deduction", async () => {
    await new OpenAiProvider("key").complete(baseRequest({ responseSchemaName: "SomeFutureSchemaNotYetWhitelisted" }));

    expect(sentBody().response_format).toEqual({ type: "json_object" });
  });

  it("keeps the unchanged json_object behavior for an empty responseSchemaName", async () => {
    await new OpenAiProvider("key").complete(baseRequest({ responseSchemaName: "" }));

    expect(sentBody().response_format).toEqual({ type: "json_object" });
  });

  it("never sends a strict schema for any name outside the two-entry whitelist", () => {
    expect(Object.keys(STRICT_OUTPUT_SCHEMAS).sort()).toEqual(["DocumentAnalysisOutputSchema", "TenderConsolidationOutputSchema"]);
  });

  it("changes nothing else in the request payload for a whitelisted schema — same model/messages/timeout handling as before", async () => {
    await new OpenAiProvider("key").complete(baseRequest({ responseSchemaName: "DocumentAnalysisOutputSchema", model: "gpt-4o-mini", maxOutputTokens: 500, temperature: 0.2 }));

    const body = sentBody();
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.max_tokens).toBe(500);
    expect(body.temperature).toBe(0.2);
    expect(body.messages).toEqual([
      { role: "system", content: "system" },
      { role: "user", content: "user" },
    ]);
  });

  it("throws AiInvalidResponseError on a model refusal — never a silently empty content", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: null, refusal: "cannot comply with the requested schema" } }] }), { status: 200 }),
    );

    await expect(new OpenAiProvider("key").complete(baseRequest({ responseSchemaName: "DocumentAnalysisOutputSchema" }))).rejects.toBeInstanceOf(
      AiInvalidResponseError,
    );
  });

  it("throws AiInvalidResponseError when content is null without a refusal — never coerced to an empty string", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: null } }] }), { status: 200 }));

    await expect(new OpenAiProvider("key").complete(baseRequest())).rejects.toBeInstanceOf(AiInvalidResponseError);
  });

  it("still returns the real content untouched when the message shape is unchanged (regression guard for free_text/generation)", async () => {
    const result = await new OpenAiProvider("key").complete(baseRequest({ responseSchemaName: "free_text" }));
    expect(result.content).toBe('{"ok":true}');
  });
});

/** Mission — correctif "AI_INVALID_RESPONSE: AI provider returned HTTP 400" sans aucun détail
 *  exploitable : le corps d'erreur d'OpenAI (jamais du contenu client, toujours une description du
 *  problème de FORME de la requête envoyée) est désormais inclus dans `reason`, jamais ignoré. */
describe("OpenAiProvider — détail des erreurs HTTP du provider", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes OpenAI's own error message in the reason for a 400 response", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Invalid schema for response_format 'X': field 'foo' is required" } }), { status: 400 }),
    );

    await expect(new OpenAiProvider("key").complete(baseRequest())).rejects.toMatchObject({
      message: expect.stringContaining("Invalid schema for response_format 'X': field 'foo' is required"),
    });
  });

  it("includes OpenAI's own error message in the reason for a 5xx response", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "The server had an error processing your request" } }), { status: 503 }));

    let caught: unknown;
    try {
      await new OpenAiProvider("key").complete(baseRequest());
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AiProviderUnavailableError);
    expect((caught as Error).message).toContain("The server had an error processing your request");
  });

  it("falls back to just the HTTP status when the error body is not valid JSON — never throws while describing the failure", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("not json", { status: 400 }));

    await expect(new OpenAiProvider("key").complete(baseRequest())).rejects.toBeInstanceOf(AiInvalidResponseError);
  });

  it("truncates an overly long error message rather than persisting it unbounded", async () => {
    const longMessage = "x".repeat(1000);
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: longMessage } }), { status: 400 }));

    let caught: unknown;
    try {
      await new OpenAiProvider("key").complete(baseRequest());
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AiInvalidResponseError);
    expect((caught as Error).message.length).toBeLessThan(longMessage.length);
  });
});
