import { beforeEach, describe, expect, it, vi } from "vitest";
import { TechnicalMemoSectionRevisionSource, TechnicalMemoStatus, TechnicalMemoTemplateOrigin } from "../../domain/enums";
import { TechnicalMemo } from "../../domain/technical-memo.aggregate";
import { TechnicalMemoSection } from "../../domain/technical-memo-section.entity";
import { TechnicalMemoSectionRevision } from "../../domain/technical-memo-section-revision.entity";
import {
  FakeAtomicTransactionRunner,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryTechnicalMemoSectionRepository,
  InMemoryTechnicalMemoSectionRevisionRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import type { TechnicalMemoAccessService } from "../services/technical-memo-access.service";
import { EditTechnicalMemoSectionUseCase } from "./edit-technical-memo-section.use-case";

const ORG = "org-1";
const OCCURRED_AT = new Date("2026-01-01T00:00:00.000Z");

const MEMO = TechnicalMemo.rehydrate({
  id: "memo-1",
  organizationId: ORG,
  tenderId: "tender-1",
  clientAccountId: "client-1",
  templateOrigin: TechnicalMemoTemplateOrigin.TenderOsSystem,
  status: TechnicalMemoStatus.Draft,
  createdBy: "user-1",
  createdAt: OCCURRED_AT,
  updatedAt: OCCURRED_AT,
});

const SECTION = TechnicalMemoSection.create({
  id: "section-1",
  organizationId: ORG,
  technicalMemoId: MEMO.id,
  sectionKey: "key-section-1",
  title: "Moyens humains",
  order: 0,
  level: 1,
  createdBy: "user-1",
  occurredAt: OCCURRED_AT,
});

describe("EditTechnicalMemoSectionUseCase (Checkpoint 2.1-P2.1-FIX-D, correctif audit FIXD-P1-001)", () => {
  let sectionRepository: InMemoryTechnicalMemoSectionRepository;
  let revisionRepository: InMemoryTechnicalMemoSectionRevisionRepository;
  let accessService: { loadMemo: ReturnType<typeof vi.fn> };
  let getTenderUseCase: { execute: ReturnType<typeof vi.fn> };

  function buildUseCase(): EditTechnicalMemoSectionUseCase {
    return new EditTechnicalMemoSectionUseCase(
      sectionRepository,
      revisionRepository,
      new InMemoryAuditLogWriter(),
      new FakeAtomicTransactionRunner(),
      new FixedClock(),
      new SequentialIdGenerator(),
      accessService as unknown as TechnicalMemoAccessService,
      getTenderUseCase as never,
    );
  }

  beforeEach(() => {
    sectionRepository = new InMemoryTechnicalMemoSectionRepository();
    sectionRepository.sections.push(SECTION);
    revisionRepository = new InMemoryTechnicalMemoSectionRevisionRepository();
    accessService = { loadMemo: vi.fn(async () => MEMO) };
    getTenderUseCase = { execute: vi.fn(async () => ({ candidateCompanyId: "candidate-alpha" })) };
  });

  // BLOQUANT (audit FIXD-P1-001) — le scénario exact rapporté : une section AI_GENERATED avait
  // capturé analysisVersion/dceRevision (dépendance DCE réelle). Un humain l'édite ensuite. La
  // NOUVELLE révision MANUAL doit CONSERVER cette provenance — jamais l'effacer — sinon
  // `computeTechnicalMemoSectionFreshness` confond "aucune dépendance DCE" et "dépendance DCE dont
  // la provenance a été perdue", et une section devenue STALE après un changement DCE redeviendrait
  // silencieusement CURRENT dès qu'un humain la modifie.
  it("BLOQUANT — a manual edit of a section that had a real DCE dependency CARRIES FORWARD analysisVersion/dceRevision, never erases them", async () => {
    revisionRepository.revisions.push(
      TechnicalMemoSectionRevision.create({
        id: "rev-1",
        organizationId: ORG,
        technicalMemoSectionId: SECTION.id,
        revisionNumber: 1,
        source: TechnicalMemoSectionRevisionSource.AiGenerated,
        content: "Contenu IA généré contre l'exigence DCE.",
        candidateCompanyId: "candidate-alpha",
        analysisVersion: 1,
        dceRevision: 1,
        createdBy: "user-1",
        occurredAt: OCCURRED_AT,
      }),
    );

    const revision = await buildUseCase().execute({
      organizationId: ORG,
      actorId: "user-2",
      actorRole: "BID_MANAGER",
      technicalMemoId: MEMO.id,
      technicalMemoSectionId: SECTION.id,
      content: "Contenu corrigé par un humain.",
    });

    expect(revision.source).toBe(TechnicalMemoSectionRevisionSource.Manual);
    expect(revision.analysisVersion).toBe(1);
    expect(revision.dceRevision).toBe(1);
    expect(revision.candidateCompanyId).toBe("candidate-alpha");
  });

  // Un deuxième édit à la chaîne doit continuer à porter la même provenance (portée par la révision
  // MANUAL précédente elle-même, jamais reperdue à chaque étape).
  it("BLOQUANT — a chain of manual edits keeps carrying the original DCE provenance forward at each step", async () => {
    revisionRepository.revisions.push(
      TechnicalMemoSectionRevision.create({
        id: "rev-1",
        organizationId: ORG,
        technicalMemoSectionId: SECTION.id,
        revisionNumber: 1,
        source: TechnicalMemoSectionRevisionSource.AiGenerated,
        content: "V1 IA.",
        candidateCompanyId: "candidate-alpha",
        analysisVersion: 1,
        dceRevision: 1,
        createdBy: "user-1",
        occurredAt: OCCURRED_AT,
      }),
    );

    const useCase = buildUseCase();
    await useCase.execute({ organizationId: ORG, actorId: "user-2", actorRole: "BID_MANAGER", technicalMemoId: MEMO.id, technicalMemoSectionId: SECTION.id, content: "Première correction." });
    const secondEdit = await useCase.execute({ organizationId: ORG, actorId: "user-2", actorRole: "BID_MANAGER", technicalMemoId: MEMO.id, technicalMemoSectionId: SECTION.id, content: "Deuxième correction." });

    expect(secondEdit.analysisVersion).toBe(1);
    expect(secondEdit.dceRevision).toBe(1);
  });

  // Une section qui n'a JAMAIS eu de dépendance DCE (ex. "Présentation de l'entreprise") ne doit
  // jamais s'en voir fabriquer une par cette conservation — l'absence reste une absence.
  it("a manual edit of a section that never had a DCE dependency stays without one — never a fabricated dependency", async () => {
    revisionRepository.revisions.push(
      TechnicalMemoSectionRevision.create({
        id: "rev-1",
        organizationId: ORG,
        technicalMemoSectionId: SECTION.id,
        revisionNumber: 1,
        source: TechnicalMemoSectionRevisionSource.AiGenerated,
        content: "Contenu IA sans exigence DCE liée.",
        candidateCompanyId: "candidate-alpha",
        createdBy: "user-1",
        occurredAt: OCCURRED_AT,
      }),
    );

    const revision = await buildUseCase().execute({
      organizationId: ORG,
      actorId: "user-2",
      actorRole: "BID_MANAGER",
      technicalMemoId: MEMO.id,
      technicalMemoSectionId: SECTION.id,
      content: "Correction humaine.",
    });

    expect(revision.analysisVersion).toBeUndefined();
    expect(revision.dceRevision).toBeUndefined();
  });

  // Une toute première rédaction manuelle (aucune révision antérieure — jamais générée par l'IA)
  // n'a rien à conserver : reste sans dépendance DCE, ce qui est correct et sûr.
  it("a first-ever manual authorship (no prior revision at all) has no DCE provenance to carry forward", async () => {
    const revision = await buildUseCase().execute({
      organizationId: ORG,
      actorId: "user-2",
      actorRole: "BID_MANAGER",
      technicalMemoId: MEMO.id,
      technicalMemoSectionId: SECTION.id,
      content: "Rédaction humaine directe.",
    });

    expect(revision.analysisVersion).toBeUndefined();
    expect(revision.dceRevision).toBeUndefined();
    expect(revision.candidateCompanyId).toBe("candidate-alpha");
  });
});
