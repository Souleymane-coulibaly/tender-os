import { describe, expect, it } from "vitest";
import { DeliverableRevision } from "./deliverable-revision.aggregate";
import { DeliverableRevisionSourceType } from "./deliverable-revision-source-type";
import { DeliverableRevisionStatus } from "./deliverable-revision-status";
import { ImmutableRevisionError, RevisionEditConflictError, RevisionNotValidatedForExportError } from "./errors";
import { DeliverableExportSelection } from "./deliverable-export-selection.entity";

const NOW = new Date("2026-09-01T10:00:00.000Z");

function manualContent(text = "Contenu initial") {
  return [{ kind: "paragraph", text }];
}

function baseInput(overrides: Partial<Parameters<typeof DeliverableRevision.create>[0]> = {}) {
  return {
    id: "rev-1",
    organizationId: "org-1",
    deliverableSectionId: "section-1",
    revisionNumber: 1,
    sourceType: DeliverableRevisionSourceType.Manual,
    content: manualContent(),
    createdBy: "user-1",
    createdByRole: "BID_MANAGER",
    occurredAt: NOW,
    ...overrides,
  };
}

describe("DeliverableRevision", () => {
  it("rejects an AI_GENERATED revision without a sourceGenerationId", () => {
    expect(() => DeliverableRevision.create(baseInput({ sourceType: DeliverableRevisionSourceType.AiGenerated }))).toThrow();
  });

  it("rejects a RESTORED revision without a previousRevisionId", () => {
    expect(() => DeliverableRevision.create(baseInput({ sourceType: DeliverableRevisionSourceType.Restored }))).toThrow();
  });

  it("computes characterCount and contentText from the structured content on creation", () => {
    const revision = DeliverableRevision.create(baseInput({ content: manualContent("Bonjour le monde") }));
    expect(revision.contentText).toBe("Bonjour le monde");
    expect(revision.characterCount).toBe("Bonjour le monde".length);
    expect(revision.editVersion).toBe(0);
    expect(revision.status).toBe(DeliverableRevisionStatus.Draft);
  });

  it("rejects malformed structured content (unknown block kind) — sanitisation, mission §9", () => {
    expect(() => DeliverableRevision.create(baseInput({ content: [{ kind: "script", text: "alert(1)" }] }))).toThrow();
  });

  it("rejects a run href that is not an absolute http(s) URL — controlled links, mission §9", () => {
    const content = [{ kind: "paragraph", text: "voir", runs: [{ text: "lien", href: "javascript:alert(1)" }] }];
    expect(() => DeliverableRevision.create(baseInput({ content }))).toThrow();
  });

  it("accepts a run href that is an absolute http(s) URL", () => {
    const content = [{ kind: "paragraph", text: "voir", runs: [{ text: "lien", href: "https://example.org/preuve" }] }];
    const revision = DeliverableRevision.create(baseInput({ content }));
    expect(revision.contentStructured[0]).toMatchObject({ kind: "paragraph" });
  });

  it("applyEdit bumps editVersion and updates content when expectedEditVersion matches", () => {
    const revision = DeliverableRevision.create(baseInput());
    revision.applyEdit({ content: manualContent("Nouveau contenu"), expectedEditVersion: 0, occurredAt: NOW });
    expect(revision.editVersion).toBe(1);
    expect(revision.contentText).toBe("Nouveau contenu");
  });

  it("applyEdit throws RevisionEditConflictError on a stale editVersion — mission §18, no silent overwrite", () => {
    const revision = DeliverableRevision.create(baseInput());
    revision.applyEdit({ content: manualContent("v1"), expectedEditVersion: 0, occurredAt: NOW });
    expect(() => revision.applyEdit({ content: manualContent("v2 (stale)"), expectedEditVersion: 0, occurredAt: NOW })).toThrow(RevisionEditConflictError);
    // Aucune donnée perdue : le contenu réellement persisté reste celui du premier éditeur.
    expect(revision.contentText).toBe("v1");
  });

  it("applyEdit throws ImmutableRevisionError once the revision is no longer DRAFT — mission §9/§10", () => {
    const revision = DeliverableRevision.create(baseInput());
    revision.submitForReview(NOW);
    revision.validate(NOW);
    expect(() => revision.applyEdit({ content: manualContent("trop tard"), expectedEditVersion: 0, occurredAt: NOW })).toThrow(ImmutableRevisionError);
  });

  it("follows DRAFT -> READY_FOR_REVIEW -> VALIDATED, then refuses any further transition", () => {
    const revision = DeliverableRevision.create(baseInput());
    revision.submitForReview(NOW);
    expect(revision.status).toBe(DeliverableRevisionStatus.ReadyForReview);
    revision.validate(NOW);
    expect(revision.status).toBe(DeliverableRevisionStatus.Validated);
    expect(revision.isValidated).toBe(true);
    expect(() => revision.submitForReview(NOW)).toThrow();
    expect(() => revision.requestChanges(NOW)).toThrow();
  });

  it("supports READY_FOR_REVIEW -> CHANGES_REQUESTED and -> REJECTED as terminal-for-this-row outcomes", () => {
    const changesRequested = DeliverableRevision.create(baseInput({ id: "rev-a" }));
    changesRequested.submitForReview(NOW);
    changesRequested.requestChanges(NOW);
    expect(changesRequested.status).toBe(DeliverableRevisionStatus.ChangesRequested);
    expect(() => changesRequested.submitForReview(NOW)).toThrow();

    const rejected = DeliverableRevision.create(baseInput({ id: "rev-b" }));
    rejected.submitForReview(NOW);
    rejected.reject(NOW);
    expect(rejected.status).toBe(DeliverableRevisionStatus.Rejected);
  });

  it("allows withdrawing from review back to DRAFT before any decision", () => {
    const revision = DeliverableRevision.create(baseInput());
    revision.submitForReview(NOW);
    revision.withdrawFromReview(NOW);
    expect(revision.status).toBe(DeliverableRevisionStatus.Draft);
    // toujours éditable après retrait
    revision.applyEdit({ content: manualContent("suite"), expectedEditVersion: 0, occurredAt: NOW });
    expect(revision.editVersion).toBe(1);
  });

  it("DeliverableExportSelection refuses a non-VALIDATED revision — mission §11 absolute rule", () => {
    const draft = DeliverableRevision.create(baseInput());
    expect(() =>
      DeliverableExportSelection.create({
        id: "sel-1",
        organizationId: "org-1",
        deliverableSectionId: "section-1",
        revision: draft,
        selectedBy: "user-1",
        occurredAt: NOW,
      }),
    ).toThrow(RevisionNotValidatedForExportError);
  });

  it("DeliverableExportSelection accepts a VALIDATED revision", () => {
    const revision = DeliverableRevision.create(baseInput());
    revision.submitForReview(NOW);
    revision.validate(NOW);
    const selection = DeliverableExportSelection.create({
      id: "sel-1",
      organizationId: "org-1",
      deliverableSectionId: "section-1",
      revision,
      selectedBy: "user-1",
      occurredAt: NOW,
    });
    expect(selection.deliverableRevisionId).toBe(revision.id);
  });
});
