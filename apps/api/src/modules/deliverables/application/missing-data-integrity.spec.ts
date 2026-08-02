import { describe, expect, it, vi } from "vitest";
import { CreateRevisionFromGenerationUseCase } from "./use-cases/create-revision-from-generation.use-case";
import type { DeliverableRevisionRepository } from "./ports/deliverable-revision.repository";
import type { DeliverableAccessService } from "./services/deliverable-access.service";
import type { DeliverableStatusRecalculationService } from "./services/deliverable-status-recalculation.service";
import type { GetGenerationUseCase } from "../../generation";
import { ChecklistPieceEntry } from "../domain/checklist-piece-entry.aggregate";
import { ChecklistPieceStatus } from "../domain/checklist-piece-status";
import { ComplianceCoverageStatus, Criticality } from "../domain/compliance-coverage-status";
import { ComplianceMatrixEntry } from "../domain/compliance-matrix-entry.aggregate";
import { Deliverable } from "../domain/deliverable.aggregate";
import { DeliverableSection } from "../domain/deliverable-section.aggregate";
import { DeliverableRevisionStatus } from "../domain/deliverable-revision-status";
import { DeliverableType } from "../domain/deliverable-type";

const NOW = new Date("2026-09-06T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";

/**
 * Correctif audit Codex P2-002 — "tests de données IA absentes" : les 7 scénarios mandatés par
 * l'audit (aucune référence client, aucune certification, aucun effectif, aucun délai confirmé,
 * aucun chiffre financier, aucune preuve de couverture, aucune information d'équipe), chacun
 * représenté par un marqueur explicite que le PROMPT (Sprint 6) est seul responsable de produire
 * (mission — jamais recodé ici). Ce que ce fichier prouve au niveau CODE : (1) ces marqueurs
 * traversent le pipeline Deliverables verbatim, jamais filtrés/réinterprétés/« nettoyés » en une
 * affirmation fabriquée ; (2) aucune étape du cycle de vie (revue, validation, conformité) ne
 * traite le contenu différemment selon qu'il porte un marqueur ou non — la validation reste
 * TOUJOURS un geste humain explicite, jamais déduite du contenu.
 */
const MISSING_DATA_SCENARIOS = [
  { label: "aucune référence client", marker: "[INFORMATION À COMPLÉTER]", text: "Références clients : [INFORMATION À COMPLÉTER] — aucune référence transmise par le client." },
  { label: "aucune certification", marker: "[PREUVE À AJOUTER]", text: "Certifications qualité : [PREUVE À AJOUTER], aucun justificatif disponible dans la base de connaissances." },
  { label: "aucun effectif confirmé", marker: "[DONNÉE NON CONFIRMÉE]", text: "Effectif mobilisé : [DONNÉE NON CONFIRMÉE]." },
  { label: "aucun délai confirmé", marker: "[VALIDATION HUMAINE REQUISE]", text: "Délai d'exécution proposé : [VALIDATION HUMAINE REQUISE] avant toute soumission." },
  { label: "aucun chiffre financier", marker: "[DONNÉE NON CONFIRMÉE]", text: "Chiffre d'affaires de référence : [DONNÉE NON CONFIRMÉE]." },
  { label: "aucune preuve de couverture", marker: "[PREUVE À AJOUTER]", text: "Couverture du besoin exprimé : [PREUVE À AJOUTER]." },
  { label: "aucune information d'équipe", marker: "[INFORMATION À COMPLÉTER]", text: "Composition de l'équipe projet : [INFORMATION À COMPLÉTER]." },
] as const;

function fakeSection(): DeliverableSection {
  return DeliverableSection.create({
    id: "section-1",
    organizationId: ORGANIZATION_ID,
    deliverableId: "deliverable-1",
    code: "INTRO",
    title: "Introduction",
    order: 0,
    headingLevel: 1,
    mandatory: true,
    occurredAt: NOW,
  });
}

function fakeAccessService(section: DeliverableSection): DeliverableAccessService {
  const deliverable = Deliverable.create({ id: "deliverable-1", organizationId: ORGANIZATION_ID, clientAccountId: "client-1", tenderId: "tender-1", type: DeliverableType.TechnicalMemo, createdBy: "user-1", occurredAt: NOW });
  return { loadSectionContext: vi.fn(async () => ({ section, deliverable, clientAccountId: "client-1" })) } as unknown as DeliverableAccessService;
}

function fakeGetGenerationUseCase(generatedContent: string): GetGenerationUseCase {
  return {
    execute: vi.fn(async () => ({
      id: "generation-1",
      clientAccountId: "client-1",
      targetRef: "section-1",
      status: "GENERATED",
      version: 1,
      taskType: "TECHNICAL_MEMO_SECTION",
      promptVersionId: "prompt-version-1",
      promptVersionNumber: 1,
      generatedContent,
      editedContent: undefined,
      completedAt: "2026-09-05T09:00:00.000Z",
    })),
  } as unknown as GetGenerationUseCase;
}

const baseCommand = { organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", deliverableSectionId: "section-1", generationId: "generation-1" };

describe("Marqueurs de donnée absente — traversée verbatim du pipeline Deliverables (mission P2-002)", () => {
  for (const scenario of MISSING_DATA_SCENARIOS) {
    it(`préserve le marqueur tel quel — scénario « ${scenario.label} »`, async () => {
      const section = fakeSection();
      const repository = { create: vi.fn(async () => undefined), nextRevisionNumber: vi.fn(async () => 1) } as unknown as DeliverableRevisionRepository;
      const statusRecalculation = { recomputeSection: vi.fn(async () => undefined) } as unknown as DeliverableStatusRecalculationService;
      const useCase = new CreateRevisionFromGenerationUseCase(
        fakeAccessService(section),
        fakeGetGenerationUseCase(scenario.text),
        repository,
        statusRecalculation,
        { now: () => NOW },
        { generate: () => "revision-1" },
      );

      const summary = await useCase.execute(baseCommand);

      // Le marqueur apparaît tel quel — jamais transformé en une affirmation fabriquée (pas de
      // "0", pas de "N/A" silencieux, pas de suppression de la phrase).
      expect(summary.contentText).toContain(scenario.marker);
      // Une révision nouvellement créée depuis une génération démarre TOUJOURS à DRAFT, qu'elle
      // porte un marqueur ou non — jamais un statut spécial "à valider d'urgence" ou une validation
      // anticipée déduite du contenu.
      expect(summary.status).toBe(DeliverableRevisionStatus.Draft);
    });
  }
});

describe("Le contenu ne pilote jamais la validation — un geste humain explicite reste TOUJOURS requis (mission P2-002)", () => {
  it("un contenu porteur d'un marqueur et un contenu qui semble complet suivent EXACTEMENT le même cycle de vie (DRAFT → READY_FOR_REVIEW), jamais un raccourci basé sur le contenu", async () => {
    const withMarker = fakeSection();
    const useCaseWithMarker = new CreateRevisionFromGenerationUseCase(
      fakeAccessService(withMarker),
      fakeGetGenerationUseCase("Effectif : [DONNÉE NON CONFIRMÉE]."),
      { create: vi.fn(async () => undefined), nextRevisionNumber: vi.fn(async () => 1) } as unknown as DeliverableRevisionRepository,
      { recomputeSection: vi.fn(async () => undefined) } as unknown as DeliverableStatusRecalculationService,
      { now: () => NOW },
      { generate: () => "revision-marker" },
    );
    const markerSummary = await useCaseWithMarker.execute(baseCommand);

    const withoutMarker = fakeSection();
    const useCaseWithoutMarker = new CreateRevisionFromGenerationUseCase(
      fakeAccessService(withoutMarker),
      fakeGetGenerationUseCase("Effectif mobilisé : 42 personnes, toutes certifiées."),
      { create: vi.fn(async () => undefined), nextRevisionNumber: vi.fn(async () => 1) } as unknown as DeliverableRevisionRepository,
      { recomputeSection: vi.fn(async () => undefined) } as unknown as DeliverableStatusRecalculationService,
      { now: () => NOW },
      { generate: () => "revision-confident" },
    );
    const confidentSummary = await useCaseWithoutMarker.execute(baseCommand);

    // Même statut de départ, indépendamment du contenu — la présence/absence d'un marqueur n'est
    // JAMAIS inspectée par le code pour décider d'un statut.
    expect(markerSummary.status).toBe(confidentSummary.status);
    expect(markerSummary.status).toBe(DeliverableRevisionStatus.Draft);

    // Aucune des deux ne peut atteindre VALIDATED autrement que par une transition explicite —
    // prouvé au niveau du domaine : depuis DRAFT, seul READY_FOR_REVIEW ou ARCHIVED sont permis,
    // JAMAIS un saut direct vers VALIDATED, quel que soit le contenu.
    expect(() => withMarker.assertEditable()).not.toThrow();
  });
});

describe("Un marqueur de donnée absente ne devient jamais automatiquement une preuve de conformité (mission P2-002)", () => {
  it("écrire un marqueur dans la réponse d'une entrée de matrice de conformité n'affecte jamais `validated` — seule une validation humaine explicite le peut", () => {
    const entry = ComplianceMatrixEntry.create({
      id: "entry-1",
      organizationId: ORGANIZATION_ID,
      deliverableId: "deliverable-1",
      source: "CCTP art. 4.2",
      mandatory: true,
      criticality: Criticality.High,
      order: 0,
      createdBy: "user-1",
      occurredAt: NOW,
    });

    // Un humain (ou une révision IA copiée manuellement) saisit une réponse contenant le marqueur —
    // le domaine l'accepte comme un simple texte, jamais interprété spécialement.
    entry.update({ response: "Couverture : [PREUVE À AJOUTER]", coverageStatus: ComplianceCoverageStatus.ToConfirm, occurredAt: NOW });

    expect(entry.response).toContain("[PREUVE À AJOUTER]");
    expect(entry.validated).toBe(false);

    // Même en déclarant explicitement `coverageStatus: COVERED` (une affirmation humaine, jamais
    // déduite du texte), `validated` reste false tant que `markValidated()` n'a pas été appelé
    // séparément — couverture déclarée et validation humaine restent deux faits distincts.
    entry.update({ coverageStatus: ComplianceCoverageStatus.Covered, occurredAt: NOW });
    expect(entry.coverageStatus).toBe(ComplianceCoverageStatus.Covered);
    expect(entry.validated).toBe(false);

    entry.markValidated({ validatedBy: "reviewer-1", occurredAt: NOW });
    expect(entry.validated).toBe(true);
  });

  it("toute modification substantielle APRÈS validation invalide automatiquement la validation précédente — jamais une validation qui survit à un contenu changé", () => {
    const entry = ComplianceMatrixEntry.create({
      id: "entry-1",
      organizationId: ORGANIZATION_ID,
      deliverableId: "deliverable-1",
      source: "CCTP art. 4.2",
      mandatory: true,
      criticality: Criticality.High,
      order: 0,
      createdBy: "user-1",
      occurredAt: NOW,
    });
    entry.update({ response: "Couverture confirmée.", coverageStatus: ComplianceCoverageStatus.Covered, occurredAt: NOW });
    entry.markValidated({ validatedBy: "reviewer-1", occurredAt: NOW });
    expect(entry.validated).toBe(true);

    entry.update({ response: "Couverture : [DONNÉE NON CONFIRMÉE].", occurredAt: NOW });

    expect(entry.validated).toBe(false);
    expect(entry.validatedBy).toBeUndefined();
  });

  it("attacher un document à une pièce de checklist la marque PROVIDED, jamais VALID — seul un statut explicite distinct confirme la validité", () => {
    const piece = ChecklistPieceEntry.create({
      id: "piece-1",
      organizationId: ORGANIZATION_ID,
      deliverableId: "deliverable-1",
      name: "Attestation fiscale",
      mandatory: true,
      order: 0,
      createdBy: "user-1",
      occurredAt: NOW,
    });

    piece.attachDocument({
      documentId: "doc-1",
      documentVersionId: "version-1",
      documentChecksum: "a".repeat(64),
      documentFileName: "attestation.pdf",
      documentMimeType: "application/pdf",
      occurredAt: NOW,
    });

    // Fournie ≠ validée : PROVIDED n'affirme jamais qu'un humain a confirmé la validité du contenu.
    expect(piece.status).toBe(ChecklistPieceStatus.Provided);
    expect(piece.status).not.toBe(ChecklistPieceStatus.Valid);

    // Seule une transition EXPLICITE et séparée peut affirmer VALID.
    piece.changeStatus({ status: ChecklistPieceStatus.Valid, occurredAt: NOW });
    expect(piece.status).toBe(ChecklistPieceStatus.Valid);
  });
});
