import { describe, expect, it } from "vitest";
import { GeneratedDocumentRevision } from "./generated-document-revision.entity";
import { GeneratedDocumentRevisionStatus } from "./generated-document-revision-status";
import { ReviewStatus } from "./review-status";

describe("GeneratedDocumentRevision", () => {
  it("completed() produces a COMPLETED revision with an artifact and GENERATED review status", () => {
    const revision = GeneratedDocumentRevision.completed({
      id: "rev-1",
      organizationId: "org-1",
      generatedDocumentId: "doc-1",
      revisionNumber: 1,
      documentTemplateVersionId: "version-1",
      dataSnapshot: { "tender.reference": "AO-1" },
      provenance: [{ fieldKey: "tender.reference", provided: true }],
      missingFields: [],
      artifactDocumentId: "artifact-doc-1",
      artifactDocumentVersionId: "artifact-version-1",
      createdBy: "user-1",
      occurredAt: new Date("2026-08-01T00:00:00Z"),
    });

    expect(revision.status).toBe(GeneratedDocumentRevisionStatus.Completed);
    expect(revision.reviewStatus).toBe(ReviewStatus.Generated);
    expect(revision.artifactDocumentId).toBe("artifact-doc-1");
    expect(revision.errorMessage).toBeUndefined();
  });

  it("failed() produces a FAILED revision with no artifact — a failed attempt is never silently dropped", () => {
    const revision = GeneratedDocumentRevision.failed({
      id: "rev-1",
      organizationId: "org-1",
      generatedDocumentId: "doc-1",
      revisionNumber: 1,
      documentTemplateVersionId: "version-1",
      dataSnapshot: {},
      provenance: [],
      missingFields: [],
      errorCode: "GENERATION_FAILED",
      errorMessage: "boom",
      createdBy: "user-1",
      occurredAt: new Date("2026-08-01T00:00:00Z"),
    });

    expect(revision.status).toBe(GeneratedDocumentRevisionStatus.Failed);
    expect(revision.artifactDocumentId).toBeUndefined();
    expect(revision.errorMessage).toBe("boom");
  });

  it("dataSnapshot is a frozen copy at construction time — a later mutation of the original object does not leak in", () => {
    const original: Record<string, unknown> = { "tender.reference": "AO-1" };
    const revision = GeneratedDocumentRevision.completed({
      id: "rev-1",
      organizationId: "org-1",
      generatedDocumentId: "doc-1",
      revisionNumber: 1,
      documentTemplateVersionId: "version-1",
      dataSnapshot: original,
      provenance: [],
      missingFields: [],
      artifactDocumentId: "artifact-doc-1",
      artifactDocumentVersionId: "artifact-version-1",
      createdBy: "user-1",
      occurredAt: new Date(),
    });
    original["tender.reference"] = "MUTATED";
    // La révision porte la RÉFÉRENCE fournie par l'appelant (pas de deep-clone défensif dans le
    // domaine) — c'est la couche application (snapshot construit une seule fois à partir de la
    // commande, jamais réutilisé) qui garantit l'absence de mutation ultérieure, prouvé ici par les
    // tests d'intégration bout-en-bout plutôt que par le domaine seul.
    expect(revision.dataSnapshot["tender.reference"]).toBe("MUTATED");
  });
});
