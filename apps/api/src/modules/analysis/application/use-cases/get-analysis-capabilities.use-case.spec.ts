import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetTenderUseCase } from "../../../tenders";
import { AiProviderNotConfiguredError } from "../../domain/errors";
import { PromptKey } from "../ports/prompt-template.port";
import type { AIProvider } from "../ports/ai-provider";
import type { AIProviderRegistry } from "../ports/ai-provider-registry";
import { GetAnalysisCapabilitiesUseCase } from "./get-analysis-capabilities.use-case";

const ORG = "org-1";
const TENDER = "tender-1";

class FakeAiProviderRegistry implements AIProviderRegistry {
  constructor(private readonly behavior: "ready" | "not_configured") {}
  resolve(): AIProvider {
    if (this.behavior === "not_configured") {
      throw new AiProviderNotConfiguredError({ reason: "no AI_PROVIDER configured" });
    }
    return { name: "FAKE", complete: async () => ({ content: "{}", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, durationMs: 1 }) };
  }
}

describe("GetAnalysisCapabilitiesUseCase", () => {
  let getTenderUseCase: { execute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    getTenderUseCase = { execute: vi.fn(async () => ({ id: TENDER, organizationId: ORG })) };
  });

  it("reports both ANALYZE_DOCUMENT and CONSOLIDATE_TENDER_ANALYSIS as ready when the AI provider resolves successfully", async () => {
    const useCase = new GetAnalysisCapabilitiesUseCase(getTenderUseCase as unknown as GetTenderUseCase, new FakeAiProviderRegistry("ready"));

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result).toEqual([
      { taskType: PromptKey.AnalyzeDocument, ready: true },
      { taskType: PromptKey.ConsolidateTenderAnalysis, ready: true },
    ]);
  });

  it("reports AI_PROVIDER_NOT_CONFIGURED for both task types when no AI provider is configured, never a silent success", async () => {
    const useCase = new GetAnalysisCapabilitiesUseCase(getTenderUseCase as unknown as GetTenderUseCase, new FakeAiProviderRegistry("not_configured"));

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result).toEqual([
      { taskType: PromptKey.AnalyzeDocument, ready: false, reasonCode: "AI_PROVIDER_NOT_CONFIGURED" },
      { taskType: PromptKey.ConsolidateTenderAnalysis, ready: false, reasonCode: "AI_PROVIDER_NOT_CONFIGURED" },
    ]);
  });

  it("propagates a TENDER_NOT_FOUND from GetTenderUseCase unchanged, never a silently empty capability list", async () => {
    const notFound = new Error("TENDER_NOT_FOUND");
    getTenderUseCase.execute = vi.fn(async () => {
      throw notFound;
    });
    const useCase = new GetAnalysisCapabilitiesUseCase(getTenderUseCase as unknown as GetTenderUseCase, new FakeAiProviderRegistry("ready"));

    await expect(useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "BID_MANAGER" })).rejects.toBe(notFound);
  });

  it("rejects a role with no analysis:read permission before ever calling GetTenderUseCase", async () => {
    const useCase = new GetAnalysisCapabilitiesUseCase(getTenderUseCase as unknown as GetTenderUseCase, new FakeAiProviderRegistry("ready"));

    await expect(useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "UNKNOWN_ROLE" })).rejects.toThrow();
    expect(getTenderUseCase.execute).not.toHaveBeenCalled();
  });
});
