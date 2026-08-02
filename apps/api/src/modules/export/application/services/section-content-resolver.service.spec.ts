import { describe, expect, it, vi } from "vitest";
import type { GetGenerationUseCase } from "../../../generation";
import type { GetPricingEstimateUseCase } from "../../../pricing";
import { SectionContentResolverService } from "./section-content-resolver.service";

const ESTIMATE_ID = "estimate-1";

function fakePricingUseCase(): Pick<GetPricingEstimateUseCase, "execute"> {
  return {
    execute: vi.fn(async (query: { estimateId: string; version?: number | undefined; organizationId: string; actorId: string; actorRole: string }) => {
      // Simule une estimation dont la version COURANTE a avancé depuis la sélection initiale
      // (currentVersionNumber = 2), mais dont la version 1 reste consultable pour toujours.
      const version = query.version === undefined ? 2 : query.version;
      const amount = version === 1 ? "500.00" : "999.00";
      return {
        id: query.estimateId,
        clientAccountId: "client-1",
        currentVersionNumber: 2,
        currentVersion: { version, amount, currency: "EUR", breakdown: [{ label: "Temps de préparation", amount, currency: "EUR" }] },
      } as never;
    }),
  };
}

/**
 * Mission (audit de correction) — "Pricing version dans export" : prouve que
 * `SectionContentResolverService` appelle `GetPricingEstimateUseCase` avec `estimateId` ET
 * `version` explicites (jamais un identifiant de version passé à la place d'un `estimateId`,
 * bug réel corrigé), et qu'un export FIGE exactement la version sélectionnée — il ne bascule
 * JAMAIS sur la version courante, même après un second appel (`resolveContentOnly`, le chemin
 * emprunté au figeage FINAL) alors que la version courante a entre-temps avancé.
 */
describe("SectionContentResolverService — gel de version pricing", () => {
  it("resolve(): appelle GetPricingEstimateUseCase avec le VRAI estimateId et le numéro de version demandé (jamais un id de version à la place d'un estimateId)", async () => {
    const pricingUseCase = fakePricingUseCase();
    const resolver = new SectionContentResolverService({} as GetGenerationUseCase, pricingUseCase as GetPricingEstimateUseCase);

    const { sections, resolvedContent } = await resolver.resolve({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      clientAccountId: "client-1",
      selections: [{ sectionId: "COSTS", sourceType: "PRICING", pricingEstimateId: ESTIMATE_ID, pricingEstimateVersionNumber: 1 }],
      selectedBy: "user-1",
      occurredAt: new Date("2026-09-01T10:00:00Z"),
    });

    expect(pricingUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ estimateId: ESTIMATE_ID, version: 1 }));
    expect(sections[0]!.pricingEstimateId).toBe(ESTIMATE_ID);
    expect(sections[0]!.pricingEstimateVersionNumber).toBe(1);
    expect(resolvedContent.get("COSTS")!.table!.rows).toEqual([["Temps de préparation", "500.00 EUR"]]);
  });

  it("resolve(): sans numéro de version explicite, FIGE le numéro réellement résolu maintenant — jamais 'undefined' silencieusement propagé", async () => {
    const pricingUseCase = fakePricingUseCase();
    const resolver = new SectionContentResolverService({} as GetGenerationUseCase, pricingUseCase as GetPricingEstimateUseCase);

    const { sections } = await resolver.resolve({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      clientAccountId: "client-1",
      selections: [{ sectionId: "COSTS", sourceType: "PRICING", pricingEstimateId: ESTIMATE_ID }],
      selectedBy: "user-1",
      occurredAt: new Date("2026-09-01T10:00:00Z"),
    });

    // La version courante au moment de la sélection était 2 — gelée explicitement sur la ligne.
    expect(sections[0]!.pricingEstimateVersionNumber).toBe(2);
  });

  it("resolveContentOnly() (chemin du figeage FINAL) redemande EXACTEMENT la même version gelée, jamais la version courante — même si celle-ci a changé entre-temps", async () => {
    const pricingUseCase = fakePricingUseCase();
    const resolver = new SectionContentResolverService({} as GetGenerationUseCase, pricingUseCase as GetPricingEstimateUseCase);
    const occurredAt = new Date("2026-09-01T10:00:00Z");

    const { sections } = await resolver.resolve({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      clientAccountId: "client-1",
      selections: [{ sectionId: "COSTS", sourceType: "PRICING", pricingEstimateId: ESTIMATE_ID, pricingEstimateVersionNumber: 1 }],
      selectedBy: "user-1",
      occurredAt,
    });

    (pricingUseCase.execute as ReturnType<typeof vi.fn>).mockClear();

    // Simule le figeage FINAL, potentiellement bien après un recalcul qui a fait avancer la
    // version courante à 2 — la sélection déjà figée référence toujours la version 1.
    const resolvedContent = await resolver.resolveContentOnly({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", sections });

    expect(pricingUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ estimateId: ESTIMATE_ID, version: 1 }));
    expect(resolvedContent.get("COSTS")!.table!.rows).toEqual([["Temps de préparation", "500.00 EUR"]]);
  });
});

/**
 * Correctif audit Codex P1-001 — "traçabilité export et manifest" : une section MANUAL/ANNEX qui
 * transporte une provenance Deliverables (deliverableId/deliverableSectionId/deliverableRevisionId/
 * revisionNumber/validationStatus/selectedBy/selectedAt) la conserve verbatim sur l'`ExportSectionSelection`
 * produite, et le `validationStatus` de la sélection reflète le statut RÉEL de la révision (jamais
 * une affirmation VALIDATED non prouvée par l'appelant).
 */
describe("SectionContentResolverService — provenance Deliverables (audit Codex P1-001)", () => {
  const provenance = {
    deliverableId: "deliverable-1",
    deliverableSectionId: "section-1",
    deliverableRevisionId: "revision-1",
    revisionNumber: 1,
    validationStatus: "VALIDATED",
    selectedBy: "user-1",
    selectedAt: new Date("2026-09-06T10:00:00Z"),
  };

  it("conserve la provenance Deliverables verbatim sur la sélection MANUAL produite", async () => {
    const resolver = new SectionContentResolverService({} as GetGenerationUseCase, {} as GetPricingEstimateUseCase);

    const { sections } = await resolver.resolve({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      clientAccountId: "client-1",
      selections: [{ sectionId: "INTRO", sourceType: "MANUAL", manualContent: "Contenu validé.", deliverableProvenance: provenance }],
      selectedBy: "user-1",
      occurredAt: new Date("2026-09-06T11:00:00Z"),
    });

    expect(sections[0]!.deliverableProvenance).toEqual(provenance);
    expect(sections[0]!.validationStatus).toBe("VALIDATED");
  });

  it("marque NOT_VALIDATED (jamais VALIDATED) quand la provenance porte un statut de révision non validé", async () => {
    const resolver = new SectionContentResolverService({} as GetGenerationUseCase, {} as GetPricingEstimateUseCase);

    const { sections } = await resolver.resolve({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      clientAccountId: "client-1",
      selections: [{ sectionId: "INTRO", sourceType: "MANUAL", manualContent: "Brouillon.", deliverableProvenance: { ...provenance, validationStatus: "DRAFT" } }],
      selectedBy: "user-1",
      occurredAt: new Date("2026-09-06T11:00:00Z"),
    });

    expect(sections[0]!.validationStatus).toBe("NOT_VALIDATED");
  });

  it("laisse la provenance absente (undefined) pour une section MANUAL Sprint 8A qui n'origine pas de Deliverables", async () => {
    const resolver = new SectionContentResolverService({} as GetGenerationUseCase, {} as GetPricingEstimateUseCase);

    const { sections } = await resolver.resolve({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      clientAccountId: "client-1",
      selections: [{ sectionId: "INTRO", sourceType: "MANUAL", manualContent: "Texte saisi directement dans Export." }],
      selectedBy: "user-1",
      occurredAt: new Date("2026-09-06T11:00:00Z"),
    });

    expect(sections[0]!.deliverableProvenance).toBeUndefined();
    expect(sections[0]!.validationStatus).toBe("UNKNOWN");
  });
});
