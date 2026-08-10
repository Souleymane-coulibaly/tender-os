import { describe, expect, it } from "vitest";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import type { OutlineHeading } from "../../infrastructure/docx-outline-extractor";
import { NoHeadingsDetectedError } from "../../domain/errors";
import { buildSectionsFromOutline } from "./build-sections-from-outline";

function fakeIdGenerator(): IdGenerator {
  let counter = 0;
  return { generate: () => `id-${++counter}` };
}

const OCCURRED_AT = new Date("2026-01-01T00:00:00Z");

describe("buildSectionsFromOutline", () => {
  it("BLOQUANT — lève NoHeadingsDetectedError sur un outline vide (mission §13 — jamais un plan inventé)", () => {
    expect(() =>
      buildSectionsFromOutline({ outline: [], organizationId: "org-1", technicalMemoId: "memo-1", createdBy: "user-1", occurredAt: OCCURRED_AT, idGenerator: fakeIdGenerator() }),
    ).toThrow(NoHeadingsDetectedError);
  });

  it("reconstruit la hiérarchie parent/enfant via parentSegmentIndex → id de section réel", () => {
    const outline: OutlineHeading[] = [
      { segmentIndex: 0, level: 1, title: "1. Présentation", isTable: false },
      { segmentIndex: 3, level: 1, title: "2. Compréhension du besoin", isTable: false },
      { segmentIndex: 5, level: 2, title: "2.1 Contexte", parentSegmentIndex: 3, isTable: false },
      { segmentIndex: 7, level: 2, title: "2.2 Enjeux", parentSegmentIndex: 3, isTable: false },
    ];
    const sections = buildSectionsFromOutline({ outline, organizationId: "org-1", technicalMemoId: "memo-1", createdBy: "user-1", occurredAt: OCCURRED_AT, idGenerator: fakeIdGenerator() });

    expect(sections).toHaveLength(4);
    const understanding = sections[1]!;
    const context = sections[2]!;
    const stakes = sections[3]!;
    expect(context.parentSectionId).toBe(understanding.id);
    expect(stakes.parentSectionId).toBe(understanding.id);
    expect(sections[0]!.parentSectionId).toBeUndefined();
  });

  it("préserve l'ordre du document et dérive des sectionKey stables/uniques", () => {
    const outline: OutlineHeading[] = [
      { segmentIndex: 0, level: 1, title: "1. Présentation", isTable: false },
      { segmentIndex: 2, level: 1, title: "1. Présentation", isTable: false },
    ];
    const sections = buildSectionsFromOutline({ outline, organizationId: "org-1", technicalMemoId: "memo-1", createdBy: "user-1", occurredAt: OCCURRED_AT, idGenerator: fakeIdGenerator() });
    expect(sections[0]!.sectionKey).not.toBe(sections[1]!.sectionKey);
    expect(sections.map((s) => s.order)).toEqual([0, 1]);
  });

  it("transmet instructionText/isTable tels quels, jamais inventés", () => {
    const outline: OutlineHeading[] = [{ segmentIndex: 0, level: 1, title: "4. Moyens humains", isTable: true, instructionText: "Complétez le tableau." }];
    const sections = buildSectionsFromOutline({ outline, organizationId: "org-1", technicalMemoId: "memo-1", createdBy: "user-1", occurredAt: OCCURRED_AT, idGenerator: fakeIdGenerator() });
    expect(sections[0]!.isTable).toBe(true);
    expect(sections[0]!.instructionText).toBe("Complétez le tableau.");
  });
});
