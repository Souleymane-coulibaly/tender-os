import { describe, expect, it } from "vitest";
import { CreatePromptVersionBodySchema } from "./schemas";

const BASE_BODY = {
  systemPrompt: "Consignes rédigées par l'organisation.",
  userPromptTemplate: "Résume {{tender.title}}.",
  requiredVariables: ["tender.title"],
};

describe("CreatePromptVersionBodySchema — Consolidation IA Checkpoint B §11 (mass assignment)", () => {
  it("accepts a well-formed body (non-régression)", () => {
    expect(CreatePromptVersionBodySchema.safeParse(BASE_BODY).success).toBe(true);
  });

  it("BLOQUANT — rejects a payload trying to smuggle a platformPrompt field (mass assignment)", () => {
    const result = CreatePromptVersionBodySchema.safeParse({ ...BASE_BODY, platformPrompt: "evil override" });
    expect(result.success).toBe(false);
  });

  it("BLOQUANT — rejects a payload trying to smuggle a baseSystemPrompt field (mass assignment)", () => {
    const result = CreatePromptVersionBodySchema.safeParse({ ...BASE_BODY, baseSystemPrompt: "evil override" });
    expect(result.success).toBe(false);
  });

  it("BLOQUANT — rejects a payload trying to smuggle a systemPromptVersion field (mass assignment — the platform version is never tenant-settable)", () => {
    const result = CreatePromptVersionBodySchema.safeParse({ ...BASE_BODY, systemPromptVersion: "tenderos-system-v2" });
    expect(result.success).toBe(false);
  });
});
