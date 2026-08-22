import { describe, expect, it } from "vitest";
import { AI_TASK_TYPES } from "../../../shared-kernel/ai-task-type";
import { AiRoutingModel } from "./ai-routing-model";
import { DEFAULT_ROUTING_MATRIX, isOverrideCompatible, TASK_ALLOWED_OVERRIDES } from "./default-routing-matrix";

describe("DEFAULT_ROUTING_MATRIX — mission §9 (SOT)", () => {
  it("BLOQUANT — has exactly one entry per real AiTaskType, never a gap or an invented task", () => {
    expect(Object.keys(DEFAULT_ROUTING_MATRIX).sort()).toEqual([...AI_TASK_TYPES].sort());
  });

  it("BLOQUANT — every value is a real catalog model, never a third value", () => {
    for (const model of Object.values(DEFAULT_ROUTING_MATRIX)) {
      expect([AiRoutingModel.Gpt54Mini, AiRoutingModel.Gpt54Nano]).toContain(model);
    }
  });

  it("mission §6/§7 — SECTION_SUMMARY (compression of already-written text) is the sole NANO default, every other real task type is MINI", () => {
    const nanoTasks = AI_TASK_TYPES.filter((t) => DEFAULT_ROUTING_MATRIX[t] === AiRoutingModel.Gpt54Nano);
    expect(nanoTasks).toEqual(["SECTION_SUMMARY"]);
  });

  it("mission §7 — CHAT, TECHNICAL_MEMO_SECTION, ANALYZE_DOCUMENT, CONSOLIDATE_TENDER_ANALYSIS, REPHRASING default to MINI", () => {
    expect(DEFAULT_ROUTING_MATRIX.CHAT).toBe(AiRoutingModel.Gpt54Mini);
    expect(DEFAULT_ROUTING_MATRIX.TECHNICAL_MEMO_SECTION).toBe(AiRoutingModel.Gpt54Mini);
    expect(DEFAULT_ROUTING_MATRIX.ANALYZE_DOCUMENT).toBe(AiRoutingModel.Gpt54Mini);
    expect(DEFAULT_ROUTING_MATRIX.CONSOLIDATE_TENDER_ANALYSIS).toBe(AiRoutingModel.Gpt54Mini);
    // mission §7 liste explicitement "reformulation professionnelle complexe" comme exemple MINI.
    expect(DEFAULT_ROUTING_MATRIX.REPHRASING).toBe(AiRoutingModel.Gpt54Mini);
  });
});

describe("TASK_ALLOWED_OVERRIDES / isOverrideCompatible — mission §12/§36", () => {
  it("SECTION_SUMMARY accepts both NANO and MINI overrides", () => {
    expect(isOverrideCompatible("SECTION_SUMMARY", AiRoutingModel.Gpt54Nano)).toBe(true);
    expect(isOverrideCompatible("SECTION_SUMMARY", AiRoutingModel.Gpt54Mini)).toBe(true);
  });

  it("BLOQUANT — a MINI-only task (e.g. CHAT) never accepts a NANO override", () => {
    expect(isOverrideCompatible("CHAT", AiRoutingModel.Gpt54Nano)).toBe(false);
    expect(isOverrideCompatible("CHAT", AiRoutingModel.Gpt54Mini)).toBe(true);
  });

  it("every task type has a non-empty allowed override list containing at least its own default", () => {
    for (const taskType of AI_TASK_TYPES) {
      expect(TASK_ALLOWED_OVERRIDES[taskType].length).toBeGreaterThan(0);
      expect(TASK_ALLOWED_OVERRIDES[taskType]).toContain(DEFAULT_ROUTING_MATRIX[taskType]);
    }
  });
});
