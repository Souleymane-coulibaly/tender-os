import { describe, expect, it } from "vitest";
import { TENDEROS_SYSTEM_PROMPT } from "../../../shared-kernel/tenderos-system-prompt";
import { buildTechnicalMemoSystemPrompt } from "./technical-memo-system-prompt";

describe("buildTechnicalMemoSystemPrompt — Consolidation IA Checkpoint B (Prompt Architecture & Security)", () => {
  // Correctif audit P2 "séparation de rôle" — le System Prompt plateforme n'est plus concaténé ici :
  // `OpenAiProvider.complete()` l'injecte comme son propre message `{role: "system"}`, toujours en
  // premier (voir openai.ai-provider.spec.ts). Ce prompt reste PUREMENT le texte de tâche Mémoire
  // technique.
  it("never embeds the platform System Prompt text — injected separately by OpenAiProvider", () => {
    const prompt = buildTechnicalMemoSystemPrompt();
    expect(prompt).not.toContain(TENDEROS_SYSTEM_PROMPT);
  });

  it("still contains Mémoire technique's own anti-fabrication rule (nothing lost, defense in depth)", () => {
    const prompt = buildTechnicalMemoSystemPrompt();
    expect(prompt).toContain("assistant de rédaction IA de TenderOS");
    expect(prompt).toContain("N'invente JAMAIS une donnée chiffrée");
  });

  it("still contains the required JSON output contract", () => {
    const prompt = buildTechnicalMemoSystemPrompt();
    expect(prompt).toContain('{"content": string, "citations": [{"sourceRef": string, "excerpt"?: string}], "missingDataNotes": string[]}');
  });
});

describe("buildTechnicalMemoSystemPrompt — Checkpoint TENDEROS-2.1-P2.3-E4.2 (task isolation / model independence)", () => {
  it("BLOQUANT — mission §17 TEST_TASK_ISOLATION: never mentions Chat-specific vocabulary (insufficientContext, historique de conversation)", () => {
    const prompt = buildTechnicalMemoSystemPrompt();
    expect(prompt).not.toContain("insufficientContext");
    expect(prompt).not.toContain("historique de conversation");
  });

  it("BLOQUANT — mission §18 TEST_MODEL_INDEPENDENCE: never names a production model — the TECHNICAL_MEMO_SECTION/MINI default lives exclusively in AiModelRouter's routing matrix, never here", () => {
    expect(buildTechnicalMemoSystemPrompt().toLowerCase()).not.toContain("gpt-5.4");
  });
});
