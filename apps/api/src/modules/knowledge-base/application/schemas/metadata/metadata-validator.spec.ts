import { describe, expect, it } from "vitest";
import { KnowledgeCategory } from "../../../domain/knowledge-category";
import { KnowledgeMetadataValidationFailedError } from "../../../domain/errors";
import { validateKnowledgeMetadata } from "./metadata-validator";

describe("validateKnowledgeMetadata", () => {
  it("accepts a well-formed CLIENT_REFERENCE metadata object", () => {
    const result = validateKnowledgeMetadata(KnowledgeCategory.ClientReference, {
      clientName: "Acme Corp",
      sector: "Retail",
      amount: 250000,
      currency: "EUR",
      technologies: ["Azure", "React"],
      contactAvailable: true,
    });
    expect(result.clientName).toBe("Acme Corp");
  });

  it("rejects an unknown field on a strict category schema (CLIENT_REFERENCE)", () => {
    expect(() => validateKnowledgeMetadata(KnowledgeCategory.ClientReference, { clientName: "Acme", notAField: true })).toThrow(
      KnowledgeMetadataValidationFailedError,
    );
  });

  it("rejects a currency that is not exactly 3 characters", () => {
    expect(() => validateKnowledgeMetadata(KnowledgeCategory.ClientReference, { currency: "EURO" })).toThrow(KnowledgeMetadataValidationFailedError);
  });

  it("accepts a well-formed CONSULTANT_PROFILE metadata object", () => {
    const result = validateKnowledgeMetadata(KnowledgeCategory.ConsultantProfile, {
      fullName: "Jean Dupont",
      yearsOfExperience: 8,
      skills: ["Cloud", "Kubernetes"],
      languages: ["fr", "en"],
    });
    expect(result.fullName).toBe("Jean Dupont");
  });

  it("rejects a negative yearsOfExperience", () => {
    expect(() => validateKnowledgeMetadata(KnowledgeCategory.ConsultantProfile, { yearsOfExperience: -1 })).toThrow(KnowledgeMetadataValidationFailedError);
  });

  it("accepts a well-formed CERTIFICATION metadata object", () => {
    const result = validateKnowledgeMetadata(KnowledgeCategory.Certification, { name: "ISO 27001", issuer: "AFNOR", certificateNumber: "ABC-123" });
    expect(result.name).toBe("ISO 27001");
  });

  it("rejects a non-uuid proofDocumentId on CERTIFICATION", () => {
    expect(() => validateKnowledgeMetadata(KnowledgeCategory.Certification, { proofDocumentId: "not-a-uuid" })).toThrow(KnowledgeMetadataValidationFailedError);
  });

  it("accepts an empty metadata object for every category (all fields optional)", () => {
    for (const category of Object.values(KnowledgeCategory)) {
      expect(() => validateKnowledgeMetadata(category, {})).not.toThrow();
    }
  });

  it("accepts a bounded generic metadata object for a category without a dedicated schema (e.g. METHODOLOGY)", () => {
    const result = validateKnowledgeMetadata(KnowledgeCategory.Methodology, { framework: "Agile", durationWeeks: 6, tags: ["scrum", "kanban"] });
    expect(result.framework).toBe("Agile");
  });

  it("rejects a generic metadata object with too many fields (over 40)", () => {
    const tooMany: Record<string, string> = {};
    for (let i = 0; i < 41; i++) tooMany[`field${i}`] = "x";
    expect(() => validateKnowledgeMetadata(KnowledgeCategory.Other, tooMany)).toThrow(KnowledgeMetadataValidationFailedError);
  });

  it("rejects a deeply nested object value in generic metadata (jamais une structure arbitrairement imbriquée)", () => {
    expect(() => validateKnowledgeMetadata(KnowledgeCategory.Other, { nested: { a: 1 } })).toThrow(KnowledgeMetadataValidationFailedError);
  });

  it("treats undefined/null input as an empty object rather than throwing", () => {
    expect(() => validateKnowledgeMetadata(KnowledgeCategory.ClientReference, undefined)).not.toThrow();
  });
});
