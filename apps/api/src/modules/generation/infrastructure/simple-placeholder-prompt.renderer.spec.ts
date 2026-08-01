import { describe, expect, it } from "vitest";
import { SimplePlaceholderPromptRenderer } from "./simple-placeholder-prompt.renderer";
import { PromptVersion } from "../domain/prompt-version.entity";

const NOW = new Date("2026-08-01T10:00:00.000Z");

function versionWith(systemPrompt: string, userPromptTemplate: string): PromptVersion {
  return PromptVersion.create({
    id: "version-1",
    organizationId: "org-1",
    promptTemplateId: "template-1",
    version: 1,
    systemPrompt,
    userPromptTemplate,
    requiredVariables: [],
    authorUserId: "user-1",
    occurredAt: NOW,
  });
}

describe("SimplePlaceholderPromptRenderer", () => {
  it("substitutes known placeholders literally", () => {
    const renderer = new SimplePlaceholderPromptRenderer();
    const version = versionWith("You are helpful.", "Summarize: {{tender.title}}");
    const result = renderer.render(version, { "tender.title": "Marché de fournitures" });
    expect(result.userPrompt).toBe("Summarize: Marché de fournitures");
    expect(result.systemPrompt).toBe("You are helpful.");
  });

  it("throws explicitly on an unresolved placeholder, never a silent gap", () => {
    const renderer = new SimplePlaceholderPromptRenderer();
    const version = versionWith("You are helpful.", "Summarize: {{tender.title}} for {{client.name}}");
    expect(() => renderer.render(version, { "tender.title": "X" })).toThrow(/client\.name/);
  });

  it("never evaluates the placeholder content as code (literal substitution only)", () => {
    const renderer = new SimplePlaceholderPromptRenderer();
    const version = versionWith("System.", "{{payload}}");
    const result = renderer.render(version, { payload: "{{tender.title}}" });
    expect(result.userPrompt).toBe("{{tender.title}}");
  });
});
