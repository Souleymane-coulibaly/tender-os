import { describe, expect, it } from "vitest";
import {
  ALLOWED_GENERATION_TRANSITIONS,
  GenerationStatus,
  isGenerationStatus,
  isTerminalGenerationStatus,
  parseGenerationStatus,
} from "./generation-status";

describe("GenerationStatus", () => {
  it("allows the PENDING -> GENERATING -> GENERATED happy path", () => {
    expect(ALLOWED_GENERATION_TRANSITIONS[GenerationStatus.Pending]).toContain(GenerationStatus.Generating);
    expect(ALLOWED_GENERATION_TRANSITIONS[GenerationStatus.Generating]).toContain(GenerationStatus.Generated);
  });

  it("allows FAILED -> PENDING as the only reopening edge (explicit retry)", () => {
    expect(ALLOWED_GENERATION_TRANSITIONS[GenerationStatus.Failed]).toEqual([GenerationStatus.Pending]);
  });

  it("allows cancellation only from PENDING or GENERATING", () => {
    expect(ALLOWED_GENERATION_TRANSITIONS[GenerationStatus.Pending]).toContain(GenerationStatus.Cancelled);
    expect(ALLOWED_GENERATION_TRANSITIONS[GenerationStatus.Generating]).toContain(GenerationStatus.Cancelled);
    expect(ALLOWED_GENERATION_TRANSITIONS[GenerationStatus.Generated]).not.toContain(GenerationStatus.Cancelled);
  });

  it("treats GENERATED, FAILED... wait FAILED is not terminal (it can reopen); GENERATED/CANCELLED are terminal", () => {
    expect(isTerminalGenerationStatus(GenerationStatus.Generated)).toBe(true);
    expect(isTerminalGenerationStatus(GenerationStatus.Cancelled)).toBe(true);
    expect(isTerminalGenerationStatus(GenerationStatus.Failed)).toBe(false);
    expect(isTerminalGenerationStatus(GenerationStatus.Pending)).toBe(false);
    expect(isTerminalGenerationStatus(GenerationStatus.Generating)).toBe(false);
  });

  it("validates and parses known values, rejects unknown ones", () => {
    expect(isGenerationStatus("GENERATED")).toBe(true);
    expect(isGenerationStatus("BOGUS")).toBe(false);
    expect(parseGenerationStatus("PENDING")).toBe(GenerationStatus.Pending);
    expect(() => parseGenerationStatus("BOGUS")).toThrow();
  });
});
