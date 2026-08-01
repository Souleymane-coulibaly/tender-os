import { describe, expect, it } from "vitest";
import { PromptVersion } from "./prompt-version.entity";
import { PromptVersionStatus } from "./prompt-version-status";

const NOW = new Date("2026-08-01T10:00:00.000Z");

function createDraft(): PromptVersion {
  return PromptVersion.create({
    id: "version-1",
    organizationId: "org-1",
    promptTemplateId: "template-1",
    version: 1,
    systemPrompt: "You are a helpful assistant.",
    userPromptTemplate: "Summarize: {{tender.title}}",
    requiredVariables: ["tender.title"],
    authorUserId: "user-1",
    occurredAt: NOW,
  });
}

describe("PromptVersion entity", () => {
  it("starts DRAFT, never active by default", () => {
    const version = createDraft();
    expect(version.status).toBe(PromptVersionStatus.Draft);
    expect(version.effectiveFrom).toBeUndefined();
  });

  it("activate() moves DRAFT -> ACTIVE and stamps effectiveFrom", () => {
    const version = createDraft();
    version.activate(NOW);
    expect(version.status).toBe(PromptVersionStatus.Active);
    expect(version.effectiveFrom).toEqual(NOW);
  });

  it("archive() moves ACTIVE -> ARCHIVED and stamps archivedAt, content stays immutable afterward", () => {
    const version = createDraft();
    version.activate(NOW);
    version.archive(NOW);
    expect(version.status).toBe(PromptVersionStatus.Archived);
    expect(version.archivedAt).toEqual(NOW);
    expect(version.systemPrompt).toBe("You are a helpful assistant.");
  });

  it("rejects an ARCHIVED -> ACTIVE transition (no reopening)", () => {
    const version = createDraft();
    version.activate(NOW);
    version.archive(NOW);
    expect(() => version.activate(NOW)).toThrow();
  });

  it("rejects a DRAFT -> ARCHIVED -> ACTIVE path once archived directly from draft", () => {
    const version = createDraft();
    version.archive(NOW);
    expect(() => version.activate(NOW)).toThrow();
  });
});
