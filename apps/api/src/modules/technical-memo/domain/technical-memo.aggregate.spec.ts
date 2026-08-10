import { describe, expect, it } from "vitest";
import { TechnicalMemoStatus, TechnicalMemoTemplateOrigin } from "./enums";
import { TechnicalMemo } from "./technical-memo.aggregate";

const OCCURRED_AT = new Date("2026-01-01T00:00:00Z");

function baseInput(overrides: Partial<Parameters<typeof TechnicalMemo.create>[0]> = {}) {
  return {
    id: "memo-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    clientAccountId: "client-1",
    templateOrigin: TechnicalMemoTemplateOrigin.CompanyTemplate,
    originalDocumentId: "doc-1",
    originalDocumentVersionId: "doc-version-1",
    createdBy: "user-1",
    occurredAt: OCCURRED_AT,
    ...overrides,
  };
}

describe("TechnicalMemo", () => {
  it("BLOQUANT — refuse la création COMPANY_TEMPLATE/DCE_REQUIRED_TEMPLATE sans originalDocumentId (mission §7)", () => {
    expect(() =>
      TechnicalMemo.create(baseInput({ originalDocumentId: undefined, templateOrigin: TechnicalMemoTemplateOrigin.CompanyTemplate })),
    ).toThrow();
    expect(() =>
      TechnicalMemo.create(baseInput({ originalDocumentId: undefined, templateOrigin: TechnicalMemoTemplateOrigin.DceRequiredTemplate })),
    ).toThrow();
  });

  it("autorise TENDEROS_SYSTEM sans originalDocumentId (mission §20 — pas d'upload)", () => {
    const memo = TechnicalMemo.create(baseInput({ originalDocumentId: undefined, originalDocumentVersionId: undefined, templateOrigin: TechnicalMemoTemplateOrigin.TenderOsSystem }));
    expect(memo.templateOrigin).toBe(TechnicalMemoTemplateOrigin.TenderOsSystem);
    expect(memo.originalDocumentId).toBeUndefined();
  });

  it("démarre en DRAFT", () => {
    const memo = TechnicalMemo.create(baseInput());
    expect(memo.status).toBe(TechnicalMemoStatus.Draft);
    expect(memo.documentTemplateId).toBeUndefined();
  });

  it("attachDocumentTemplate transitionne vers READY (mission §9)", () => {
    const memo = TechnicalMemo.create(baseInput());
    memo.attachDocumentTemplate({ documentTemplateId: "template-1", occurredAt: new Date("2026-01-02T00:00:00Z") });
    expect(memo.status).toBe(TechnicalMemoStatus.Ready);
    expect(memo.documentTemplateId).toBe("template-1");
  });

  it("markExported transitionne vers EXPORTED", () => {
    const memo = TechnicalMemo.create(baseInput());
    memo.markExported(new Date("2026-01-03T00:00:00Z"));
    expect(memo.status).toBe(TechnicalMemoStatus.Exported);
  });

  it("rehydrate restaure fidèlement l'état persisté", () => {
    const created = TechnicalMemo.create(baseInput());
    const rehydrated = TechnicalMemo.rehydrate({
      id: created.id,
      organizationId: created.organizationId,
      tenderId: created.tenderId,
      clientAccountId: created.clientAccountId,
      lotId: created.lotId,
      templateOrigin: created.templateOrigin,
      originalDocumentId: created.originalDocumentId,
      originalDocumentVersionId: created.originalDocumentVersionId,
      documentTemplateId: created.documentTemplateId,
      status: created.status,
      createdBy: created.createdBy,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
    expect(rehydrated.id).toBe(created.id);
    expect(rehydrated.status).toBe(created.status);
  });
});
