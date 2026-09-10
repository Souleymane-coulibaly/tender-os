import { describe, expect, it, vi } from "vitest";
import type { CreateChecklistItemUseCase } from "../../../tenders";
import { CREATE_FIELD_SENTINEL, type EntityTargetApplyInput, type EntityTargetReadInput } from "../../application/ports/entity-target-adapter";
import { TenderRequestedDocumentAdapter } from "./tender-requested-document.adapter";

/**
 * TENDEROS-2.1 — les suggestions héritées TENDER_REQUESTED_DOCUMENT créent un élément de checklist
 * depuis la fusion des « Pièces demandées ». Plus aucune ligne n'est écrite dans l'ancienne table.
 */
function setup() {
  const execute = vi.fn(async () => ({ id: "checklist-item-1" }));
  const adapter = new TenderRequestedDocumentAdapter({ execute } as unknown as CreateChecklistItemUseCase);
  return { adapter, execute };
}

const BASE = {
  organizationId: "org-1",
  parentTenderId: "tender-1",
  actorId: "user-1",
  actorRole: "OWNER",
  requestId: "req-1",
  fieldName: CREATE_FIELD_SENTINEL,
  entityId: undefined,
};

describe("TenderRequestedDocumentAdapter — redirection vers la checklist", () => {
  it("accepter une ancienne suggestion de pièce crée un élément de checklist, champs reportés", async () => {
    const { adapter, execute } = setup();

    const result = await adapter.applyValue({
      ...BASE,
      value: { name: "Attestation d'assurance", category: "Assurances", required: true, description: "Décennale en cours", lotId: "lot-1" },
    } as EntityTargetApplyInput);

    expect(result).toEqual({ entityId: "checklist-item-1" });
    expect(execute).toHaveBeenCalledWith({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "OWNER",
      requestId: "req-1",
      title: "Attestation d'assurance",
      description: "Décennale en cours\n\nCatégorie : Assurances",
      required: true,
      requirementLevel: "MANDATORY",
      type: "ADMINISTRATIVE_DOCUMENT",
      lotId: "lot-1",
      // L'élément naît d'une proposition de l'analyse : il relève de la réconciliation.
      origin: "AI_SUGGESTION",
    });
  });

  it("une pièce non obligatoire devient CONDITIONAL, sans description inventée", async () => {
    const { adapter, execute } = setup();

    await adapter.applyValue({ ...BASE, value: { name: "Plaquette commerciale" } } as EntityTargetApplyInput);

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ required: false, requirementLevel: "CONDITIONAL", description: undefined }));
  });

  it("une suggestion de MISE À JOUR est refusée explicitement, jamais redirigée au jugé", async () => {
    const { adapter, execute } = setup();

    await expect(
      adapter.applyValue({ ...BASE, fieldName: "name", entityId: "rd-1", value: "Nouveau nom" } as EntityTargetApplyInput),
    ).rejects.toThrow(/fusionnées dans la Checklist/);
    await expect(adapter.readCurrentValue({ ...BASE, fieldName: "name", entityId: "rd-1" } as unknown as EntityTargetReadInput)).rejects.toThrow(
      /fusionnées dans la Checklist/,
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("une proposition sans nom est rejetée", async () => {
    const { adapter } = setup();

    await expect(adapter.applyValue({ ...BASE, value: { category: "x" } } as EntityTargetApplyInput)).rejects.toThrow(/au minimum name/);
  });
});
