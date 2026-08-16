import { describe, expect, it } from "vitest";
import { DEFAULT_AI_MODEL } from "./ai-model-defaults";

describe("DEFAULT_AI_MODEL — Consolidation IA Checkpoint A (Foundation)", () => {
  it("BLOQUANT — stays gpt-4o-mini (Checkpoint A ne change AUCUN comportement, seulement sa provenance)", () => {
    expect(DEFAULT_AI_MODEL).toBe("gpt-4o-mini");
  });
});
