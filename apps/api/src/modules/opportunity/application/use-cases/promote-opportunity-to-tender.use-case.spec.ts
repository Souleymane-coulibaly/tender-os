import { describe, expect, it } from "vitest";
import { GetCandidateCompanyUseCase } from "../../../candidate-company";
import { CreateCandidateCompanyUseCase } from "../../../candidate-company/application/use-cases/create-candidate-company.use-case";
import {
  FixedClock as CandidateFixedClock,
  InMemoryAuditLogWriter as CandidateInMemoryAuditLogWriter,
  InMemoryCandidateCompanyRepository,
} from "../../../candidate-company/test-support/fakes";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { CreateTenderUseCase, GetTenderUseCase } from "../../../tenders";
import {
  InMemoryBuyerRepository,
  InMemoryTenderRepository,
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  FakeAtomicTransactionRunner as FakeTendersAtomicTransactionRunner,
} from "../../../tenders/test-support/fakes";
import {
  GoNoGoAdminBypassJustificationRequiredError,
  OpportunityMissingClientAccountError,
  OpportunityPermissionMissingError,
  OpportunityPromotionConflictError,
  OpportunityPromotionRequiresGoDecisionError,
} from "../../domain/errors";
import { GoNoGoDecisionLevel, GoNoGoDecisionValue } from "../../domain/go-no-go-decision";
import { Opportunity } from "../../domain/opportunity.aggregate";
import { OpportunityId } from "../../domain/opportunity-id.value-object";
import { OpportunityStatus } from "../../domain/opportunity-status";
import {
  FakeAtomicTransactionRunner,
  FakeOutboxWriter,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryGoNoGoDecisionRepository,
  InMemoryOpportunityRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { PromoteOpportunityToTenderUseCase } from "./promote-opportunity-to-tender.use-case";

const ORG = "org-1";
const ACTOR = { actorId: "user-1", actorRole: "BID_MANAGER" };

async function buildHarness() {
  const opportunityRepository = new InMemoryOpportunityRepository();
  const decisionRepository = new InMemoryGoNoGoDecisionRepository();
  const tenderRepository = new InMemoryTenderRepository();
  const buyerRepository = new InMemoryBuyerRepository();
  const auditLogWriter = new InMemoryAuditLogWriter();
  const outboxWriter = new FakeOutboxWriter();
  const clock = new FixedClock();
  const clientPortfolio = await createClientPortfolioTestFixture(ORG);

  const candidateCompanyRepository = new InMemoryCandidateCompanyRepository();
  const createCandidateCompanyUseCase = new CreateCandidateCompanyUseCase(
    candidateCompanyRepository,
    new CandidateInMemoryAuditLogWriter(),
    new CandidateFixedClock(),
    new UuidGenerator(),
  );
  const createTenderUseCase = new CreateTenderUseCase(
    tenderRepository,
    buyerRepository,
    { record: async () => {} },
    clock,
    new SequentialIdGenerator(),
    outboxWriter,
    new FakeTendersAtomicTransactionRunner(),
    clientPortfolio.getClientAccountUseCase,
    clientPortfolio.assertClientAccessUseCase,
    new GetCandidateCompanyUseCase(candidateCompanyRepository),
  );
  const getTenderUseCase = new GetTenderUseCase(tenderRepository, clientPortfolio.assertClientAccessUseCase);

  const atomicTransactionRunner = new FakeAtomicTransactionRunner([opportunityRepository, decisionRepository, tenderRepository]);

  const useCase = new PromoteOpportunityToTenderUseCase(
    opportunityRepository,
    decisionRepository,
    auditLogWriter,
    outboxWriter,
    clock,
    atomicTransactionRunner,
    clientPortfolio.assertClientAccessUseCase,
    createTenderUseCase,
    getTenderUseCase,
  );

  // Checkpoint CCV2-G.1 — POLICY A : la promotion exige desormais une entreprise candidate. Le
  // harness en fournit une REELLE (creee par son propre use case, jamais un objet fabrique) pour
  // les scenarios qui ne portent PAS sur cette exigence.
  const defaultCandidate = await createCandidateCompanyUseCase.execute({
    organizationId: ORG,
    actorId: "user-1",
    actorRole: "OWNER",
    name: "Candidat par defaut SAS",
  });
  DEFAULT_CANDIDATE_ID = defaultCandidate.id;

  return {
    opportunityRepository,
    decisionRepository,
    tenderRepository,
    auditLogWriter,
    outboxWriter,
    useCase,
    clock,
    clientPortfolio,
    createCandidateCompanyUseCase,
    defaultCandidateId: defaultCandidate.id,
  };
}

/** Renseigne par `buildHarness` : l'identifiant du candidat reel cree pour chaque scenario. */
let DEFAULT_CANDIDATE_ID = "";

/** Checkpoint CCV2-G.1 — porte une entreprise candidate par defaut. Le scenario qui verifie
 *  l'exigence elle-meme passe explicitement `candidateCompanyId: undefined`. */
function qualifiedOpportunity(overrides: Partial<Parameters<typeof Opportunity.create>[0]> = {}): Opportunity {
  const opportunity = Opportunity.create({
    id: OpportunityId.from("opportunity-1"),
    organizationId: ORG,
    clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
    candidateCompanyId: DEFAULT_CANDIDATE_ID,
    title: "Marché de nettoyage",
    createdBy: "user-1",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });
  opportunity.changeStatus(OpportunityStatus.ToQualify, new Date());
  opportunity.changeStatus(OpportunityStatus.Qualified, new Date());
  opportunity.changeStatus(OpportunityStatus.Go, new Date());
  return opportunity;
}

describe("PromoteOpportunityToTenderUseCase", () => {
  it("creates a new Tender, links it to the Opportunity, and marks the Opportunity PROMOTED", async () => {
    const { opportunityRepository, decisionRepository, useCase, tenderRepository } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);
    await decisionRepository.create({ id: "d1", organizationId: ORG, level: GoNoGoDecisionLevel.Opportunity, opportunityId: opportunity.id.value, decision: GoNoGoDecisionValue.Go, actorId: "user-1", decidedAt: new Date() });

    const result = await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, ...ACTOR });

    expect(result.alreadyPromoted).toBe(false);
    expect(result.opportunity.status).toBe("PROMOTED");
    expect(result.opportunity.tenderId).toBe(result.tender.id);

    const persistedTender = await tenderRepository.findById({ organizationId: ORG, tenderId: result.tender.id });
    expect(persistedTender).not.toBeNull();
    expect(persistedTender?.title).toBe("Marché de nettoyage");
  });

  it("propagates candidateCompanyId from the Opportunity to the promoted Tender (Checkpoint 2.1-A3 §13)", async () => {
    const { opportunityRepository, decisionRepository, useCase, tenderRepository, createCandidateCompanyUseCase } = await buildHarness();
    const candidate = await createCandidateCompanyUseCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "OWNER", name: "Alpha SARL" });
    const opportunity = qualifiedOpportunity({ candidateCompanyId: candidate.id });
    await opportunityRepository.seed(opportunity);
    await decisionRepository.create({ id: "d1", organizationId: ORG, level: GoNoGoDecisionLevel.Opportunity, opportunityId: opportunity.id.value, decision: GoNoGoDecisionValue.Go, actorId: "user-1", decidedAt: new Date() });

    const result = await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, ...ACTOR });

    expect(result.tender.candidateCompanyId).toBe(candidate.id);
    const persistedTender = await tenderRepository.findById({ organizationId: ORG, tenderId: result.tender.id });
    expect(persistedTender?.candidateCompanyId).toBe(candidate.id);
  });

  /**
   * Checkpoint TENDEROS-2.1-CCV2-G.1 — CONTRAT INVERSÉ. Ce test encodait la règle 2.1-A3 §14/§22
   * (« promeut sans candidat, sans jamais en inventer »), superseded par POLICY A. La seconde
   * moitié de la règle SURVIT intacte et reste l'essentiel : le produit ne devine toujours JAMAIS
   * une entreprise candidate. Ce qui change, c'est qu'il refuse désormais de promouvoir sans elle
   * au lieu de produire un Tender inexploitable.
   */
  it("BLOQUANT (CCV2-G.1) — refuse la promotion d'une Opportunity SANS candidat, et n'en invente jamais un", async () => {
    const { opportunityRepository, decisionRepository, tenderRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity({ candidateCompanyId: undefined });
    await opportunityRepository.seed(opportunity);
    await decisionRepository.create({ id: "d1", organizationId: ORG, level: GoNoGoDecisionLevel.Opportunity, opportunityId: opportunity.id.value, decision: GoNoGoDecisionValue.Go, actorId: "user-1", decidedAt: new Date() });

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, ...ACTOR })).rejects.toMatchObject({
      code: "CANDIDATE_COMPANY_REQUIRED",
    });

    // Aucun Tender orphelin : la promotion est atomique, l'échec annule tout.
    expect(tenderRepository.snapshot().size).toBe(0);
  });

  it("refuses promotion when the latest decision is NO_GO (no derogation this sprint)", async () => {
    const { opportunityRepository, decisionRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    opportunity.changeStatus(OpportunityStatus.NoGo, new Date());
    await opportunityRepository.seed(opportunity);
    await decisionRepository.create({ id: "d1", organizationId: ORG, level: GoNoGoDecisionLevel.Opportunity, opportunityId: opportunity.id.value, decision: GoNoGoDecisionValue.NoGo, justification: "Capacité insuffisante.", actorId: "user-1", decidedAt: new Date() });

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, ...ACTOR })).rejects.toThrow(OpportunityPromotionRequiresGoDecisionError);
  });

  it("refuses promotion when no decision was ever recorded", async () => {
    const { opportunityRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, ...ACTOR })).rejects.toThrow(OpportunityPromotionRequiresGoDecisionError);
  });

  it("refuses promotion when the Opportunity has no candidate company resolved", async () => {
    const { opportunityRepository, decisionRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity({ clientAccountId: undefined });
    await opportunityRepository.seed(opportunity);
    await decisionRepository.create({ id: "d1", organizationId: ORG, level: GoNoGoDecisionLevel.Opportunity, opportunityId: opportunity.id.value, decision: GoNoGoDecisionValue.Go, actorId: "user-1", decidedAt: new Date() });

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, ...ACTOR })).rejects.toThrow(OpportunityMissingClientAccountError);
  });

  it("is idempotent: promoting an already-PROMOTED Opportunity returns the existing Tender, never a second one", async () => {
    const { opportunityRepository, decisionRepository, useCase, tenderRepository } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);
    await decisionRepository.create({ id: "d1", organizationId: ORG, level: GoNoGoDecisionLevel.Opportunity, opportunityId: opportunity.id.value, decision: GoNoGoDecisionValue.Go, actorId: "user-1", decidedAt: new Date() });

    const first = await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, ...ACTOR });
    const second = await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, ...ACTOR });

    expect(second.alreadyPromoted).toBe(true);
    expect(second.tender.id).toBe(first.tender.id);
    const allTenders = await tenderRepository.list({ organizationId: ORG, limit: 100 });
    expect(allTenders.items).toHaveLength(1);
  });

  it("never leaves an orphan Tender: a reservation conflict rolls back the whole transaction, including the just-created Tender", async () => {
    const { opportunityRepository, decisionRepository, useCase, tenderRepository } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);
    await decisionRepository.create({ id: "d1", organizationId: ORG, level: GoNoGoDecisionLevel.Opportunity, opportunityId: opportunity.id.value, decision: GoNoGoDecisionValue.Go, actorId: "user-1", decidedAt: new Date() });

    // Simule une promotion concurrente gagnante : le statut change sous les pieds de l'appel en
    // cours entre sa lecture initiale et sa réservation (même Map, mutée directement — la relecture
    // `current` à l'intérieur de la transaction verra ce nouvel état).
    const concurrentlyDismissed = Opportunity.rehydrate({
      ...opportunityInternals(opportunity),
      status: OpportunityStatus.Dismissed,
    });
    await opportunityRepository.seed(concurrentlyDismissed);

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, ...ACTOR })).rejects.toThrow(OpportunityPromotionConflictError);

    const allTenders = await tenderRepository.list({ organizationId: ORG, limit: 100 });
    expect(allTenders.items).toHaveLength(0);
  });

  /**
   * Audit Codex round 2 (P1 confirmé) — même règle que pour la décision Niveau OPPORTUNITY : la
   * restriction "CLIENT_MANAGER uniquement" vit au palier client (`resolveGoNoGoClientAccess`).
   * "user-2" n'a aucune affectation sur le client (seul "user-1" en a une, via
   * `createClientPortfolioTestFixture`).
   */
  it("refuses a BID_MANAGER without a real CLIENT_MANAGER assignment on the opportunity's client (no admin bypass)", async () => {
    const { opportunityRepository, decisionRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);
    await decisionRepository.create({ id: "d1", organizationId: ORG, level: GoNoGoDecisionLevel.Opportunity, opportunityId: opportunity.id.value, decision: GoNoGoDecisionValue.Go, actorId: "user-1", decidedAt: new Date() });

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-2", actorRole: "BID_MANAGER" })).rejects.toThrow(ClientAccountNotFoundError);
  });

  it("refuses a CONTRIBUTOR outright at the organization tier (never granted OpportunityPermission.Promote)", async () => {
    const { opportunityRepository, decisionRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);
    await decisionRepository.create({ id: "d1", organizationId: ORG, level: GoNoGoDecisionLevel.Opportunity, opportunityId: opportunity.id.value, decision: GoNoGoDecisionValue.Go, actorId: "user-1", decidedAt: new Date() });

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "CONTRIBUTOR" })).rejects.toThrow(OpportunityPermissionMissingError);
  });

  it("refuses an OWNER without a real client assignment when no justification is provided (admin bypass always tracked)", async () => {
    const { opportunityRepository, decisionRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);
    await decisionRepository.create({ id: "d1", organizationId: ORG, level: GoNoGoDecisionLevel.Opportunity, opportunityId: opportunity.id.value, decision: GoNoGoDecisionValue.Go, actorId: "user-1", decidedAt: new Date() });

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-2", actorRole: "OWNER" })).rejects.toThrow(
      GoNoGoAdminBypassJustificationRequiredError,
    );
  });

  it("lets an OWNER without a real client assignment promote with a justification, and records the bypass in the audit log", async () => {
    const { opportunityRepository, decisionRepository, auditLogWriter, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);
    await decisionRepository.create({ id: "d1", organizationId: ORG, level: GoNoGoDecisionLevel.Opportunity, opportunityId: opportunity.id.value, decision: GoNoGoDecisionValue.Go, actorId: "user-1", decidedAt: new Date() });

    const result = await useCase.execute({
      organizationId: ORG,
      opportunityId: opportunity.id.value,
      actorId: "user-2",
      actorRole: "OWNER",
      justification: "Client account manager unreachable — approving under administrative privilege.",
    });

    expect(result.alreadyPromoted).toBe(false);
    const bypassEntry = auditLogWriter.entries.find((entry) => entry.action === "opportunity.promoted_to_tender");
    expect(bypassEntry?.metadata).toEqual({ clientAssignmentBypass: true });
  });

  it("never marks the audit log as a bypass for the normal CLIENT_MANAGER-assigned path", async () => {
    const { opportunityRepository, decisionRepository, auditLogWriter, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);
    await decisionRepository.create({ id: "d1", organizationId: ORG, level: GoNoGoDecisionLevel.Opportunity, opportunityId: opportunity.id.value, decision: GoNoGoDecisionValue.Go, actorId: "user-1", decidedAt: new Date() });

    await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, ...ACTOR });

    const entry = auditLogWriter.entries.find((entry) => entry.action === "opportunity.promoted_to_tender");
    expect(entry?.metadata).toBeUndefined();
  });
});

function opportunityInternals(opportunity: Opportunity) {
  return {
    id: opportunity.id,
    organizationId: opportunity.organizationId,
    clientAccountId: opportunity.clientAccountId,
    // Checkpoint CCV2-G.1 — ce helper OMETTAIT `candidateCompanyId` : toute Opportunity rehydratee
    // via lui perdait silencieusement son entreprise candidate. Defaut preexistant du harness,
    // sans consequence tant que le champ etait optionnel, revele par POLICY A. Un helper de
    // rehydratation doit refleter fidelement l'agregat, sans quoi il masque de vrais defauts.
    candidateCompanyId: opportunity.candidateCompanyId,
    buyerId: opportunity.buyerId,
    title: opportunity.title,
    description: opportunity.description,
    source: opportunity.source,
    externalReference: opportunity.externalReference,
    buyerName: opportunity.buyerName,
    sector: opportunity.sector,
    cpvCode: opportunity.cpvCode,
    location: opportunity.location,
    geographicZone: opportunity.geographicZone,
    publicationDate: opportunity.publicationDate,
    submissionDeadline: opportunity.submissionDeadline,
    estimatedAmount: opportunity.estimatedAmount,
    currency: opportunity.currency,
    procedureType: opportunity.procedureType,
    tenderId: opportunity.tenderId,
    createdBy: opportunity.createdBy,
    createdAt: opportunity.createdAt,
    updatedAt: opportunity.updatedAt,
    archivedAt: opportunity.archivedAt,
    version: opportunity.version,
  };
}
