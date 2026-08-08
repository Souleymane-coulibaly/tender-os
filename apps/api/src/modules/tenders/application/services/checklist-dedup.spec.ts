import { describe, expect, it } from "vitest";
import { ChecklistItem, ChecklistItemType, ChecklistSubjectType } from "../../domain/checklist-item.entity";
import { InMemoryChecklistItemRepository } from "../../test-support/fakes";
import { findChecklistDedupMatch } from "./checklist-dedup";

function seedItem(repository: InMemoryChecklistItemRepository, title: string, overrides: Partial<Parameters<typeof ChecklistItem.create>[0]> = {}): Promise<void> {
  return repository.save(
    ChecklistItem.create({
      id: `item-${title}`,
      organizationId: "org-1",
      tenderId: "tender-1",
      title,
      type: ChecklistItemType.Insurance,
      subjectType: ChecklistSubjectType.Candidate,
      occurredAt: new Date(),
      ...overrides,
    }),
  );
}

describe("findChecklistDedupMatch (V2 Sprint 6 §11)", () => {
  it("returns 'new' when no existing item shares type/lot/subject with the candidate title", async () => {
    const repository = new InMemoryChecklistItemRepository();
    await seedItem(repository, "Fournir une attestation d'assurance");

    const result = await findChecklistDedupMatch(repository, {
      organizationId: "org-1",
      tenderId: "tender-1",
      type: ChecklistItemType.Certification,
      subjectType: ChecklistSubjectType.Candidate,
      title: "Fournir une attestation d'assurance",
    });

    expect(result.kind).toBe("new");
  });

  it("returns 'merge' for near-identical titles of the same type/subject/lot (RC vs CCAP phrasing of the same requirement)", async () => {
    const repository = new InMemoryChecklistItemRepository();
    await seedItem(repository, "Fournir une attestation d'assurance responsabilite civile");

    const result = await findChecklistDedupMatch(repository, {
      organizationId: "org-1",
      tenderId: "tender-1",
      type: ChecklistItemType.Insurance,
      subjectType: ChecklistSubjectType.Candidate,
      title: "Fournir une attestation d'assurance responsabilite civile",
    });

    expect(result).toEqual({ kind: "merge", existingItemId: "item-Fournir une attestation d'assurance responsabilite civile", similarity: 1 });
  });

  it("returns 'possible_duplicate' for moderately similar titles, never auto-merging on weak evidence", async () => {
    const repository = new InMemoryChecklistItemRepository();
    await seedItem(repository, "Attestation assurance responsabilite civile professionnelle valide");

    const result = await findChecklistDedupMatch(repository, {
      organizationId: "org-1",
      tenderId: "tender-1",
      type: ChecklistItemType.Insurance,
      subjectType: ChecklistSubjectType.Candidate,
      title: "Attestation assurance responsabilite civile professionnelle",
    });

    expect(result.kind).toBe("possible_duplicate");
  });

  it("never matches across a different type, even with an identical title", async () => {
    const repository = new InMemoryChecklistItemRepository();
    await seedItem(repository, "Attestation fiscale", { type: ChecklistItemType.AdministrativeDocument });

    const result = await findChecklistDedupMatch(repository, {
      organizationId: "org-1",
      tenderId: "tender-1",
      type: ChecklistItemType.FinancialDocument,
      subjectType: ChecklistSubjectType.Candidate,
      title: "Attestation fiscale",
    });

    expect(result.kind).toBe("new");
  });

  it("never matches across a different lot", async () => {
    const repository = new InMemoryChecklistItemRepository();
    await seedItem(repository, "Attestation fiscale", { lotId: "lot-1" });

    const result = await findChecklistDedupMatch(repository, {
      organizationId: "org-1",
      tenderId: "tender-1",
      type: ChecklistItemType.Insurance,
      subjectType: ChecklistSubjectType.Candidate,
      title: "Attestation fiscale",
      lotId: "lot-2",
    });

    expect(result.kind).toBe("new");
  });
});
