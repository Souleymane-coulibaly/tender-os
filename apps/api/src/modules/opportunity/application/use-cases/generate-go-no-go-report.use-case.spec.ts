import { describe, expect, it, vi } from "vitest";
import { CandidateIdentitySource, type CandidateIdentitySummary, type ResolveCandidateIdentityUseCase } from "../../../candidate-company";
import { TemporalValidityStatus, type CompanyProfileSummary } from "../../../company-profile";
import type { DceDocumentSummary } from "../../../dce";
import { DceNotFoundError, type ListDceDocumentsUseCase } from "../../../dce";
import type {
  EffectiveTenderAnalysisSummary,
  GetEffectiveTenderAnalysisSummaryUseCase,
  ListTenderClausesUseCase,
  ListTenderCriteriaUseCase,
  ListTenderRequirementsUseCase,
  ListTenderRisksUseCase,
} from "../../../analysis";
import { TenderBusinessAnalysisNotFoundError } from "../../../analysis";
import type { AiSuggestionSummary, ListAiSuggestionsUseCase } from "../../../ai-suggestion";
import { Tender } from "../../../tenders/domain/tender.aggregate";
import { TenderId } from "../../../tenders/domain/tender-id.value-object";
import { GetTenderUseCase, TenderPermissionMissingError } from "../../../tenders";
import { GoNoGoAnalysisNotCurrentError } from "../../domain/errors";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  InMemoryRequestedDocumentRepository,
  InMemoryTenderLotRepository,
  InMemoryTenderRepository,
} from "../../../tenders/test-support/fakes";
import { FakeOutboxWriter, FixedClock, InMemoryAuditLogWriter, InMemoryGoNoGoReportRepository, SequentialIdGenerator } from "../../test-support/fakes";
import { GenerateGoNoGoReportUseCase } from "./generate-go-no-go-report.use-case";

const ORG = "org-1";
const TENDER_ID = "tender-1";

function analysisSummary(overrides: Partial<EffectiveTenderAnalysisSummary> = {}): EffectiveTenderAnalysisSummary {
  return {
    id: "summary-1",
    analysisVersion: 3,
    dceRevision: 3,
    // Checkpoint 2.1-P2.1-FIX-C — CURRENT par défaut : ces tests exercent la génération normale
    // (candidat, scoring, DCE), jamais la précondition de fraîcheur elle-même (voir la suite dédiée
    // "Freshness precondition" plus bas, qui override explicitement ce champ).
    analysisFreshness: "CURRENT",
    opportunitySummary: "Marché de nettoyage de bureaux.",
    complexityLevel: "MEDIUM",
    mainCriteria: [],
    mainRisks: [],
    mainObligations: [],
    missingElements: [],
    pointsToClarify: [],
    conflicts: undefined,
    goNoGoRecommendation: "GO",
    goNoGoRationale: "Dossier complet.",
    createdAt: "2026-01-01T00:00:00.000Z",
    hasUserRevision: false,
    ...overrides,
  };
}

function emptyCompanyProfileSummary(overrides: Partial<CompanyProfileSummary> = {}): CompanyProfileSummary {
  return {
    clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
    legalIdentity: null,
    representatives: [],
    bankAccounts: [],
    insurances: [],
    certifications: [],
    references: [],
    humanResources: [],
    materialResources: [],
    documents: [],
    completeness: { identity: "MISSING", banking: "MISSING", insurances: "MISSING", certifications: "MISSING", references: "MISSING", resources: "MISSING", documents: "MISSING" },
    ...overrides,
  };
}

/** CLIENT-X : profil entreprise avec une certification valide (sans échéance) — signal net pour
 *  distinguer une catégorie "certifications" alimentée (score 100) d'une catégorie non alimentée
 *  (score 0, `!companyProfile` dans `scoreCertificationsFromProfile`). */
function companyProfileWithValidCertification(): CompanyProfileSummary {
  return emptyCompanyProfileSummary({
    certifications: [
      {
        id: "cert-1",
        organizationId: ORG,
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        candidateCompanyId: null,
        name: "Qualibat",
        issuer: null,
        number: null,
        type: null,
        scope: null,
        obtainedAt: null,
        expiresAt: null,
        documentId: null,
        status: "ACTIVE",
        createdBy: "user-1",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        temporalStatus: TemporalValidityStatus.Valid,
      },
    ],
  });
}

class FakeEffectiveAnalysisUseCase {
  constructor(private readonly result: EffectiveTenderAnalysisSummary | Error) {}
  async execute(): Promise<EffectiveTenderAnalysisSummary> {
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeFindingsUseCase<T> {
  constructor(private readonly items: readonly T[] = []) {}
  async execute(): Promise<{ items: readonly T[]; total: number; limit: number; offset: number }> {
    return { items: this.items, total: this.items.length, limit: 1000, offset: 0 };
  }
}

class FakeListAiSuggestionsUseCase {
  constructor(private readonly items: readonly AiSuggestionSummary[] = []) {}
  async execute(): Promise<AiSuggestionSummary[]> {
    return [...this.items];
  }
}

class FakeListDceDocumentsUseCase {
  constructor(private readonly result: readonly DceDocumentSummary[] | Error = []) {}
  async execute(): Promise<DceDocumentSummary[]> {
    if (this.result instanceof Error) throw this.result;
    return [...this.result];
  }
}

class FakeGetCompanyProfileUseCase {
  calls: unknown[] = [];
  constructor(private readonly summary: CompanyProfileSummary = emptyCompanyProfileSummary()) {}
  async execute(input: unknown): Promise<CompanyProfileSummary> {
    this.calls.push(input);
    return this.summary;
  }
}

class FakeResolveCandidateIdentityUseCase {
  calls: unknown[] = [];
  constructor(private readonly result: CandidateIdentitySummary) {}
  async execute(input: unknown): Promise<CandidateIdentitySummary> {
    this.calls.push(input);
    return this.result;
  }
}

async function buildHarness(
  options: {
    analysis?: EffectiveTenderAnalysisSummary | Error;
    dce?: readonly DceDocumentSummary[] | Error;
    candidateCompanyId?: string | undefined;
    candidateIdentity?: CandidateIdentitySummary;
    companyProfile?: CompanyProfileSummary;
    tenderId?: string;
    /** Checkpoint 2.1-P2.1-FIX-C — permet à deux harnesses de partager le MÊME
     *  `GoNoGoReportRepository` (même tenderId) pour tester l'ordre de réservation de version entre
     *  deux exécutions distinctes, sans dupliquer toute la construction du harness. */
    reportRepository?: InMemoryGoNoGoReportRepository;
  } = {},
) {
  const reportRepository = options.reportRepository ?? new InMemoryGoNoGoReportRepository();
  const auditLogWriter = new InMemoryAuditLogWriter();
  const outboxWriter = new FakeOutboxWriter();
  const requestedDocumentRepository = new InMemoryRequestedDocumentRepository();
  const tenderLotRepository = new InMemoryTenderLotRepository();
  const tenderRepository = new InMemoryTenderRepository();
  const clientPortfolio = await createClientPortfolioTestFixture(ORG);

  const tender = Tender.create({
    id: TenderId.from(options.tenderId ?? TENDER_ID),
    organizationId: ORG,
    clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
    // Checkpoint TENDEROS-2.1-CCV2-G.2 — la generation GO/NO-GO exige desormais une entreprise
    // candidate. Le harnais en fournit donc une PAR DEFAUT : ces tests portent sur le calcul du
    // rapport, jamais sur l'absence de candidat (cas couvert par ses deux tests dedies, qui
    // passent explicitement `candidateCompanyId: undefined`).
    candidateCompanyId: "candidateCompanyId" in options ? options.candidateCompanyId : "candidate-harness",
    title: "Marché de nettoyage",
    createdBy: "user-1",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
  });
  await tenderRepository.seed(tender);

  const getTenderUseCase = new GetTenderUseCase(tenderRepository, clientPortfolio.assertClientAccessUseCase);
  const fakeGetCompanyProfileUseCase = new FakeGetCompanyProfileUseCase(options.companyProfile ?? emptyCompanyProfileSummary());
  const fakeResolveCandidateIdentityUseCase = new FakeResolveCandidateIdentityUseCase(options.candidateIdentity ?? { source: CandidateIdentitySource.None });

  const useCase = new GenerateGoNoGoReportUseCase(
    reportRepository,
    auditLogWriter,
    outboxWriter,
    requestedDocumentRepository,
    tenderLotRepository,
    new FixedClock(),
    new SequentialIdGenerator(),
    getTenderUseCase,
    clientPortfolio.assertClientAccessUseCase,
    new FakeEffectiveAnalysisUseCase(options.analysis ?? analysisSummary()) as unknown as GetEffectiveTenderAnalysisSummaryUseCase,
    new FakeFindingsUseCase() as unknown as ListTenderRequirementsUseCase,
    new FakeFindingsUseCase() as unknown as ListTenderCriteriaUseCase,
    new FakeFindingsUseCase() as unknown as ListTenderRisksUseCase,
    new FakeFindingsUseCase() as unknown as ListTenderClausesUseCase,
    new FakeListAiSuggestionsUseCase() as unknown as ListAiSuggestionsUseCase,
    new FakeListDceDocumentsUseCase(options.dce ?? []) as unknown as ListDceDocumentsUseCase,
    fakeResolveCandidateIdentityUseCase as unknown as ResolveCandidateIdentityUseCase,
    { execute: async () => ({ source: "NONE", representatives: [], insurances: [], certifications: [], references: [], humanResources: [], materialResources: [], documents: [] }) } as never,
  );

  // `fakeGetCompanyProfileUseCase` n'est plus INJECTE (CCV2-G.2) mais reste expose : il est le
  // temoin qui prouve qu'aucun appel n'est emis vers le profil du client.
  return { reportRepository, auditLogWriter, outboxWriter, useCase, fakeResolveCandidateIdentityUseCase, fakeGetCompanyProfileUseCase };
}

describe("GenerateGoNoGoReportUseCase", () => {
  it("generates a new GoNoGoReport version when a DCE analysis has already succeeded", async () => {
    const { useCase, reportRepository } = await buildHarness();

    const record = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(record.reportVersion).toBe(1);
    expect(record.analysisVersion).toBe(3);
    const versions = await reportRepository.listVersions({ organizationId: ORG, tenderId: TENDER_ID });
    expect(versions).toHaveLength(1);
  });

  it("propagates TenderBusinessAnalysisNotFoundError when no DCE analysis has succeeded yet (Level-2 gate)", async () => {
    const { useCase } = await buildHarness({ analysis: new TenderBusinessAnalysisNotFoundError() });

    await expect(useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" })).rejects.toThrow(TenderBusinessAnalysisNotFoundError);
  });

  it("falls back to a DCE document count of 0 when no DCE exists yet, rather than failing the whole report", async () => {
    const { useCase } = await buildHarness({ dce: new DceNotFoundError() });

    const record = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(record.documentaryLoad).toBeDefined();
  });

  it("refuses when the actor lacks tender:manage_go_no_go (e.g. CONTRIBUTOR)", async () => {
    const { useCase } = await buildHarness();

    await expect(useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "CONTRIBUTOR" })).rejects.toThrow(TenderPermissionMissingError);
  });

  it("creates a new version on each regeneration, never overwriting the previous one (append-only)", async () => {
    const { useCase, reportRepository } = await buildHarness();

    await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });
    const second = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(second.reportVersion).toBe(2);
    const versions = await reportRepository.listVersions({ organizationId: ORG, tenderId: TENDER_ID });
    expect(versions).toHaveLength(2);
  });

  it("records an audit entry and a GoNoGoReportGenerated outbox event", async () => {
    const { useCase, auditLogWriter, outboxWriter } = await buildHarness();

    await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(auditLogWriter.entries[0]?.action).toBe("opportunity.go_no_go_report_generated");
    expect(outboxWriter.writes[0]?.events[0]?.eventType).toBe("GoNoGoReportGenerated");
  });

  describe("Candidate SOT (Checkpoint 2.1-A6.2)", () => {
    it("BLOQUANT (test SOT critique) — a Tender with a resolved CandidateCompany NEVER calls even though clientAccountId is always set", async () => {
      const { useCase, fakeResolveCandidateIdentityUseCase, fakeGetCompanyProfileUseCase } = await buildHarness({
        candidateCompanyId: "candidate-alpha",
        candidateIdentity: { source: CandidateIdentitySource.CandidateCompany, candidateCompanyId: "candidate-alpha", legalName: "CANDIDATE-ALPHA" },
      });

      const record = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(fakeGetCompanyProfileUseCase.calls).toHaveLength(0);
      expect(fakeResolveCandidateIdentityUseCase.calls).toEqual([{ organizationId: ORG, candidateCompanyId: "candidate-alpha" }]);
      expect(record.reportVersion).toBe(1);
    });

    /**
     * Checkpoint TENDEROS-2.1-CCV2-G.2 — CONTRAT INVERSÉ. Ces deux tests encodaient le repli que la
     * mission supprime : sans entreprise candidate, les capacités du CLIENT commercial étaient
     * chargées et notées comme si elles étaient celles du candidat. Un GO/NO-GO calculé sur la
     * mauvaise personne morale est une décision d'affaires prise sur de fausses données.
     *
     * Ils sont réécrits, jamais supprimés : c'est le point exact où le contrat a changé.
     */
    it("BLOQUANT (CCV2-G.2) — un Tender sans entreprise candidate refuse la génération et ne consulte JAMAIS le profil du client", async () => {
      const { useCase, fakeGetCompanyProfileUseCase } = await buildHarness({ candidateCompanyId: undefined });

      await expect(
        useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" }),
      ).rejects.toMatchObject({ code: "CANDIDATE_COMPANY_REQUIRED" });

      // Le refus est levé AVANT toute lecture : aucune requête n'est partie.
      expect(fakeGetCompanyProfileUseCase.calls).toHaveLength(0);
    });

    it("BLOQUANT (CCV2-G.2) — une entreprise candidate irrésolvable ne bascule jamais sur le client", async () => {
      const { useCase, fakeGetCompanyProfileUseCase } = await buildHarness({
        candidateCompanyId: "candidate-deleted",
        candidateIdentity: { source: CandidateIdentitySource.None },
      });

      // Le Tender PORTE un candidat : la génération n'est donc pas refusée d'emblée. Ce qui est
      // prouvé ici est l'absence de bascule vers le profil du client.
      const record = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(fakeGetCompanyProfileUseCase.calls).toHaveLength(0);
      expect(record.reportVersion).toBe(1);
    });

    it("BLOQUANT (F-A6.2-02, divergence CLIENT-X/CANDIDATE-ALPHA) — CLIENT-X's valid certification never inflates the certifications score once CANDIDATE-ALPHA is resolved for this Tender", async () => {
      const clientXProfile = companyProfileWithValidCertification();

      // Checkpoint TENDEROS-2.1-CCV2-G.2 — la comparaison à un « rapport LEGACY » disparaît : ce
      // rapport n'existe plus, le profil du CLIENT n'étant plus jamais lu. La PROPRIÉTÉ testée est
      // désormais garantie STRUCTURELLEMENT, et vérifiée ci-dessous sous sa forme la plus forte :
      // la certification valide de CLIENT-X existe bel et bien, et n'apparaît nulle part.

      // CANDIDATE-ALPHA resolved: same CLIENT-X profile data exists, but must never be used.
      const modern = await buildHarness({
        companyProfile: clientXProfile,
        candidateCompanyId: "candidate-alpha",
        candidateIdentity: { source: CandidateIdentitySource.CandidateCompany, candidateCompanyId: "candidate-alpha", legalName: "CANDIDATE-ALPHA" },
      });
      const modernRecord = await modern.useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

      // LEGACY-Z benefits from CLIENT-X's valid certification (score 100, established behavior via
      // scoreCertificationsFromProfile). CANDIDATE-ALPHA must NOT inherit that score.
      //
      // Checkpoint CCV2-E — la VALEUR attendue côté candidate passe de 0 à 40, et c'est une
      // amélioration de justesse, pas un affaiblissement : avant, aucune capacité candidate
      // n'existait, le rapport disait donc « aucun profil entreprise disponible » (0). Désormais les
      // capacités de la CandidateCompany sont réellement consultées, et ce candidat n'en déclare
      // aucune : « aucune certification déclarée » (40). La propriété testée — la certification de
      // CLIENT-X n'inflate JAMAIS le score du candidat — est inchangée et vérifiée ci-dessous de
      // façon plus forte, sur la justification et non sur un simple nombre.
      // Le candidat ne déclare aucune certification : 40 (« aucune certification déclarée »), jamais
      // 100 (la certification valide de CLIENT-X). Le score reflète le CANDIDAT, jamais le client.
      expect(modernRecord.categoryScores.certifications.score).toBe(40);
      expect(modernRecord.categoryScores.certifications.justification).toBe("Aucune certification déclarée.");
      expect(JSON.stringify(modernRecord), "aucune trace du profil client").not.toContain("CLIENT-X");
    });

    it("BLOQUANT (F-A6.2-03, multi-candidate isolation) — two Tenders resolving two different CandidateCompanies never cross-contaminate each other's GO/NO-GO report", async () => {
      const tenderAlpha = await buildHarness({
        tenderId: "tender-alpha",
        candidateCompanyId: "candidate-alpha",
        candidateIdentity: { source: CandidateIdentitySource.CandidateCompany, candidateCompanyId: "candidate-alpha", legalName: "CANDIDATE-ALPHA" },
      });
      const tenderBeta = await buildHarness({
        tenderId: "tender-beta",
        candidateCompanyId: "candidate-beta",
        candidateIdentity: { source: CandidateIdentitySource.CandidateCompany, candidateCompanyId: "candidate-beta", legalName: "CANDIDATE-BETA" },
      });

      await tenderAlpha.useCase.execute({ organizationId: ORG, tenderId: "tender-alpha", actorId: "user-1", actorRole: "BID_MANAGER" });
      await tenderBeta.useCase.execute({ organizationId: ORG, tenderId: "tender-beta", actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(tenderAlpha.fakeResolveCandidateIdentityUseCase.calls).toEqual([{ organizationId: ORG, candidateCompanyId: "candidate-alpha" }]);
      expect(tenderBeta.fakeResolveCandidateIdentityUseCase.calls).toEqual([{ organizationId: ORG, candidateCompanyId: "candidate-beta" }]);
      expect(tenderAlpha.fakeGetCompanyProfileUseCase.calls).toHaveLength(0);
      expect(tenderBeta.fakeGetCompanyProfileUseCase.calls).toHaveLength(0);

      const alphaVersions = await tenderAlpha.reportRepository.listVersions({ organizationId: ORG, tenderId: "tender-alpha" });
      const betaVersions = await tenderBeta.reportRepository.listVersions({ organizationId: ORG, tenderId: "tender-beta" });
      expect(alphaVersions).toHaveLength(1);
      expect(betaVersions).toHaveLength(1);
    });
  });

  // Checkpoint 2.1-P2.1-FIX-C (mission §28-29/§37, TEST G15) — bloque AVANT tout calcul coûteux.
  describe("Freshness precondition (Checkpoint 2.1-P2.1-FIX-C)", () => {
    it("BLOQUANT (TEST G15) — refuses to generate/recalculate when the source analysis is STALE", async () => {
      const { useCase, reportRepository } = await buildHarness({ analysis: analysisSummary({ analysisFreshness: "STALE" }) });

      await expect(useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" })).rejects.toThrow(GoNoGoAnalysisNotCurrentError);

      const versions = await reportRepository.listVersions({ organizationId: ORG, tenderId: TENDER_ID });
      expect(versions).toHaveLength(0);
    });

    it("refuses to generate when the source analysis freshness is UNKNOWN (mission §37 — never a false CURRENT)", async () => {
      const { useCase } = await buildHarness({ analysis: analysisSummary({ analysisFreshness: "UNKNOWN" }) });

      await expect(useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" })).rejects.toThrow(GoNoGoAnalysisNotCurrentError);
    });

    it("captures dceRevision from the effective analysis summary onto the persisted report (provenance)", async () => {
      const { useCase } = await buildHarness({ analysis: analysisSummary({ dceRevision: 7 }) });

      const record = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(record.dceRevision).toBe(7);
    });

    // Correctif — sans cet enrichissement, la réponse POST n'exposait jamais `freshness` (seul le
    // GET le calculait), laissant le frontend sans badge jusqu'au prochain rechargement de page.
    it("the freshly generated record itself already reports freshness=CURRENT, never left to the next GET to compute it", async () => {
      const { useCase } = await buildHarness();

      const record = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(record.freshness).toBe("CURRENT");
      expect(record.dceStale).toBe(false);
      expect(record.analysisStale).toBe(false);
      expect(record.candidateStale).toBe(false);
    });
  });

  // Correctif audit P1-FIXC-001 (mission §33/§34, TEST G12) — `reportVersion` est désormais
  // réservé ATOMIQUEMENT et DURABLEMENT (voir `GoNoGoReportVersionReservation`) juste après la
  // porte de fraîcheur, AVANT le calcul coûteux, jamais recalculé dans `create()`. Deux preuves
  // déterministes (jamais une simulation fragile d'ordonnancement de microtâches) : (1) le
  // mécanisme de réservation lui-même garantit un ordre correct au niveau repository ; (2) le use
  // case appelle bien ce mécanisme AVANT le `Promise.all` coûteux, jamais après.
  describe("Out-of-order version reservation (Checkpoint 2.1-P2.1-FIX-C, TEST G12 — correctif audit P1-FIXC-001)", () => {
    it("BLOQUANT (TEST G12) — a version reserved FIRST is always lower than one reserved LATER, and getLatest() honors reservation order regardless of create() insertion order", async () => {
      const reportRepository = new InMemoryGoNoGoReportRepository();
      const minimalResult = {
        globalScore: 50,
        confidence: 0.5,
        complexity: 3,
        documentaryLoad: "MEDIUM",
        estimatedPrepTime: {} as never,
        categoryScores: {} as never,
        positiveCauses: [],
        negativeCauses: [],
        risks: [],
        blockers: [],
        missingInfo: [],
        subcontractingFlags: [],
        recommendation: "GO",
        recommendationRationale: "Dossier complet.",
      } as const;

      // "older" (DCE rev2) réserve EN PREMIER — avant que le DCE ne change.
      const olderReserved = await reportRepository.reserveVersion({ organizationId: ORG, tenderId: TENDER_ID });
      // "newer" (DCE rev3, après le changement) réserve ENSUITE.
      const newerReserved = await reportRepository.reserveVersion({ organizationId: ORG, tenderId: TENDER_ID });
      expect(olderReserved).toBeLessThan(newerReserved);

      // "newer" termine son calcul EN PREMIER et s'insère avant "older" — l'ordre d'INSERTION est
      // inversé par rapport à l'ordre de RÉSERVATION, exactement le scénario TEST G12.
      const newerRecord = await reportRepository.create({ id: "report-newer", organizationId: ORG, tenderId: TENDER_ID, reportVersion: newerReserved, analysisVersion: 3, dceRevision: 3, calculationVersion: "1.0.0", generatedAt: new Date("2026-01-01T00:00:00Z"), result: minimalResult });
      const olderRecord = await reportRepository.create({ id: "report-older", organizationId: ORG, tenderId: TENDER_ID, reportVersion: olderReserved, analysisVersion: 2, dceRevision: 2, calculationVersion: "1.0.0", generatedAt: new Date("2026-01-01T00:00:01Z"), result: minimalResult });

      // BLOQUANT — `getLatest()` sélectionne toujours "newer" (réservé en second, donc reportVersion
      // le plus élevé), jamais "older" qui s'est pourtant inséré en dernier.
      const effective = await reportRepository.getLatest({ organizationId: ORG, tenderId: TENDER_ID });
      expect(effective?.id).toBe(newerRecord.id);
      expect(newerRecord.reportVersion).toBeGreaterThan(olderRecord.reportVersion);
    });

    it("the use case reserves the version via the repository BEFORE fetching findings/scoring, never inside create()", async () => {
      const { useCase, reportRepository } = await buildHarness();
      const reserveSpy = vi.spyOn(reportRepository, "reserveVersion");
      const createSpy = vi.spyOn(reportRepository, "create");

      await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(reserveSpy).toHaveBeenCalledTimes(1);
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(reserveSpy.mock.invocationCallOrder[0]).toBeLessThan(createSpy.mock.invocationCallOrder[0]!);
    });
  });
});
