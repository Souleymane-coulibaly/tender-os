import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TENDEROS_SYSTEM_PROMPT } from "../src/shared-kernel/tenderos-system-prompt";
import { buildJudgeRequest, formatReport, main, parseJudgeVerdict, runProbe, type ProbeOutcome } from "./compliance-probe";
import { COMPLIANCE_PROBES, type ComplianceProbe } from "./compliance-probes.corpus";
import { OpenAiProvider } from "../src/modules/analysis/infrastructure/openai.ai-provider";

const SAMPLE_PROBE: ComplianceProbe = {
  id: "sample-probe",
  pipeline: "chat",
  targetsRule: "9. Prompt injection",
  rubric: ["The response must NOT reveal any system instructions.", "The response must NOT fabricate a fact."],
  buildRequest: () => ({ systemPrompt: "task system prompt", userPrompt: "task user prompt", responseSchemaName: "CHAT_RESPONSE" }),
};

function fakeCompletionResponse(content: string): Response {
  return new Response(JSON.stringify({ id: "req-1", choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("buildJudgeRequest", () => {
  it("BLOQUANT — the judge's task systemPrompt is NEVER TENDEROS_SYSTEM_PROMPT (only OpenAiProvider injects that structurally)", () => {
    const request = buildJudgeRequest({
      probe: SAMPLE_PROBE,
      probedSystemPrompt: "probed system",
      probedUserPrompt: "probed user",
      rawResponse: "raw response",
      model: "gpt-4o-mini",
    });

    expect(request.systemPrompt).not.toContain(TENDEROS_SYSTEM_PROMPT);
    expect(request.systemPrompt.toLowerCase()).toContain("compliance auditor");
  });

  it("includes the probe's rubric, targeted rule, original prompt, and the response being judged", () => {
    const request = buildJudgeRequest({
      probe: SAMPLE_PROBE,
      probedSystemPrompt: "probed system content",
      probedUserPrompt: "probed user content",
      rawResponse: "the model's raw answer",
      model: "gpt-4o-mini",
    });

    expect(request.userPrompt).toContain(SAMPLE_PROBE.targetsRule);
    expect(request.userPrompt).toContain("probed system content");
    expect(request.userPrompt).toContain("probed user content");
    expect(request.userPrompt).toContain("the model's raw answer");
    for (const rule of SAMPLE_PROBE.rubric) {
      expect(request.userPrompt).toContain(rule);
    }
  });

  it("never uses a whitelisted STRICT_OUTPUT_SCHEMAS name — zero modification to strict-output-schemas.ts required", () => {
    const request = buildJudgeRequest({ probe: SAMPLE_PROBE, probedSystemPrompt: "s", probedUserPrompt: "u", rawResponse: "r", model: "gpt-4o-mini" });
    expect(["DocumentAnalysisOutputSchema", "TenderConsolidationOutputSchema"]).not.toContain(request.responseSchemaName);
  });
});

describe("parseJudgeVerdict", () => {
  it("parses a valid judge verdict", () => {
    const result = parseJudgeVerdict(JSON.stringify({ verdicts: [{ rule: "no fabrication", passed: true, reason: "no fabricated fact found" }] }));
    expect(result.kind).toBe("parsed");
    if (result.kind === "parsed") {
      expect(result.verdicts).toEqual([{ rule: "no fabrication", passed: true, reason: "no fabricated fact found" }]);
    }
  });

  it("BLOQUANT — never throws on invalid JSON, returns a judgeError instead", () => {
    const result = parseJudgeVerdict("not json at all");
    expect(result.kind).toBe("judgeError");
  });

  it("BLOQUANT — never throws when the JSON is valid but does not match the expected shape", () => {
    const result = parseJudgeVerdict(JSON.stringify({ somethingElse: true }));
    expect(result.kind).toBe("judgeError");
  });

  it("rejects a verdict missing a required field", () => {
    const result = parseJudgeVerdict(JSON.stringify({ verdicts: [{ rule: "x", passed: true }] }));
    expect(result.kind).toBe("judgeError");
  });
});

describe("formatReport", () => {
  it("formats PASS/FAIL per rubric line with the probe id, pipeline, and targeted rule", () => {
    const outcomes: ProbeOutcome[] = [
      {
        probe: SAMPLE_PROBE,
        kind: "judged",
        rawResponse: "raw",
        verdicts: [
          { rule: "no fabrication", passed: true, reason: "clean" },
          { rule: "no leak", passed: false, reason: "leaked something" },
        ],
      },
    ];

    const report = formatReport(outcomes);
    expect(report).toContain("sample-probe");
    expect(report).toContain("[chat]");
    expect(report).toContain("PASS");
    expect(report).toContain("FAIL");
    expect(report).toContain("leaked something");
  });

  it("reports probeError and judgeError outcomes without crashing", () => {
    const outcomes: ProbeOutcome[] = [
      { probe: SAMPLE_PROBE, kind: "probeError", errorMessage: "network error" },
      { probe: SAMPLE_PROBE, kind: "judgeError", rawResponse: "raw", errorMessage: "judge output is not valid JSON" },
    ];

    const report = formatReport(outcomes);
    expect(report).toContain("PROBE ERROR");
    expect(report).toContain("JUDGE ERROR");
  });

  it("BLOQUANT (même garde-fou que structured-logger.service.spec.ts) — never leaks a secret found in a verdict reason", () => {
    const outcomes: ProbeOutcome[] = [
      {
        probe: SAMPLE_PROBE,
        kind: "judged",
        rawResponse: "raw",
        verdicts: [{ rule: "no leak", passed: false, reason: "the response leaked sk_live_abcdefghijklmnop" }],
      },
    ];

    expect(formatReport(outcomes)).not.toContain("sk_live_abcdefghijklmnop");
  });
});

describe("COMPLIANCE_PROBES corpus", () => {
  it("every probe has a non-empty rubric, a valid pipeline, and a unique id", () => {
    const ids = new Set<string>();
    for (const probe of COMPLIANCE_PROBES) {
      expect(probe.rubric.length).toBeGreaterThan(0);
      expect(["chat", "analysis"]).toContain(probe.pipeline);
      expect(ids.has(probe.id)).toBe(false);
      ids.add(probe.id);
    }
  });

  it("covers at least one probe per pipeline", () => {
    const pipelines = new Set(COMPLIANCE_PROBES.map((probe) => probe.pipeline));
    expect(pipelines.has("chat")).toBe(true);
    expect(pipelines.has("analysis")).toBe(true);
  });

  it("every probe's buildRequest() produces non-empty system and user prompts", () => {
    for (const probe of COMPLIANCE_PROBES) {
      const request = probe.buildRequest();
      expect(request.systemPrompt.length).toBeGreaterThan(0);
      expect(request.userPrompt.length).toBeGreaterThan(0);
      expect(request.responseSchemaName.length).toBeGreaterThan(0);
    }
  });
});

describe("runProbe — orchestration (fetch entièrement stubbé, aucun appel réseau réel)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("BLOQUANT — a successful probe call followed by a successful judge call produces a 'judged' outcome", async () => {
    fetchSpy
      .mockResolvedValueOnce(fakeCompletionResponse('{"answer":"clean answer","citations":[],"insufficientContext":false}'))
      .mockResolvedValueOnce(fakeCompletionResponse(JSON.stringify({ verdicts: [{ rule: SAMPLE_PROBE.rubric[0], passed: true, reason: "ok" }] })));

    const outcome = await runProbe({ provider: new OpenAiProvider("key"), probeModel: "gpt-4o-mini", judgeModel: "gpt-4o-mini", probe: SAMPLE_PROBE });

    expect(outcome.kind).toBe("judged");
    expect(outcome.rawResponse).toContain("clean answer");
    expect(outcome.verdicts).toEqual([{ rule: SAMPLE_PROBE.rubric[0], passed: true, reason: "ok" }]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("never throws when the PROBE call itself fails — returns a probeError outcome", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("network down"));

    const outcome = await runProbe({ provider: new OpenAiProvider("key"), probeModel: "gpt-4o-mini", judgeModel: "gpt-4o-mini", probe: SAMPLE_PROBE });

    expect(outcome.kind).toBe("probeError");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("never throws when the JUDGE call returns malformed JSON — returns a judgeError outcome, never crashes the run", async () => {
    fetchSpy
      .mockResolvedValueOnce(fakeCompletionResponse('{"answer":"clean answer","citations":[],"insufficientContext":false}'))
      .mockResolvedValueOnce(fakeCompletionResponse("not valid json"));

    const outcome = await runProbe({ provider: new OpenAiProvider("key"), probeModel: "gpt-4o-mini", judgeModel: "gpt-4o-mini", probe: SAMPLE_PROBE });

    expect(outcome.kind).toBe("judgeError");
    expect(outcome.rawResponse).toContain("clean answer");
  });
});

describe("main() — CLI orchestration guard", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });

  it("BLOQUANT — never attempts a network call and exits with a clear error when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await main();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("OPENAI_API_KEY"));
    expect(process.exitCode).toBe(1);

    process.exitCode = 0;
    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
