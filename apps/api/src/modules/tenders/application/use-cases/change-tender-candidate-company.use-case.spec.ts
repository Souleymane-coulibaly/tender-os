import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { CandidateCompanyArchivedError, GetCandidateCompanyUseCase } from "../../../candidate-company";
import { CreateCandidateCompanyUseCase } from "../../../candidate-company/application/use-cases/create-candidate-company.use-case";
import {
  FixedClock as CandidateFixedClock,
  InMemoryAuditLogWriter as CandidateInMemoryAuditLogWriter,
  InMemoryCandidateCompanyRepository,
} from "../../../candidate-company/test-support/fakes";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import { ClientAssignment } from "../../../client-portfolio/domain/client-assignment.entity";
import { ClientRole } from "../../../client-portfolio/domain/client-role";
import { TenderCandidateCompanyChangeNotAllowedError, TenderNotFoundError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import { TenderStatus } from "../../domain/tender-status";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  FakeOutboxWriter,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryTenderRepository,
} from "../../test-support/fakes";
import { ChangeTenderCandidateCompanyUseCase } from "./change-tender-candidate-company.use-case";

const ORG = "org-1";
const ACTOR = "user-1";

describe("ChangeTenderCandidateCompanyUseCase (Checkpoint 2.1-A3)", () => {
  let tenderRepository: InMemoryTenderRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let outboxWriter: FakeOutboxWriter;
  let candidateCompanyRepository: InMemoryCandidateCompanyRepository;
  let createCandidateCompanyUseCase: CreateCandidateCompanyUseCase;
  let getCandidateCompanyUseCase: GetCandidateCompanyUseCase;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let useCase: ChangeTenderCandidateCompanyUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    outboxWriter = new FakeOutboxWriter();
    candidateCompanyRepository = new InMemoryCandidateCompanyRepository();
    createCandidateCompanyUseCase = new CreateCandidateCompanyUseCase(
      candidateCompanyRepository,
      new CandidateInMemoryAuditLogWriter(),
      new CandidateFixedClock(),
      new UuidGenerator(),
    );
    getCandidateCompanyUseCase = new GetCandidateCompanyUseCase(candidateCompanyRepository);
    // Même fixture que ChangeTenderClientAccountUseCase — affecte "user-1" en CLIENT_MANAGER sur
    // DEFAULT_TEST_CLIENT_ACCOUNT_ID (voir client-portfolio/test-support), nécessaire pour la garde
    // client-aware (assertTenderMutationAllowed) que ce use case applique désormais.
    clientPortfolio = await createClientPortfolioTestFixture(ORG);
    useCase = new ChangeTenderCandidateCompanyUseCase(
      tenderRepository,
      auditLogWriter,
      new FixedClock(),
      outboxWriter,
      getCandidateCompanyUseCase,
      clientPortfolio.assertClientAccessUseCase,
    );

    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: ORG,
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        title: "Marché de nettoyage",
        createdBy: ACTOR,
        occurredAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
  });

  it("changes the candidate company, records audit metadata, and emits TenderCandidateCompanyChanged", async () => {
    const candidate = await createCandidateCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Alpha SARL" });

    const result = await useCase.execute({
      organizationId: ORG,
      tenderId: "tender-1",
      actorId: ACTOR,
      actorRole: "ORGANIZATION_ADMIN",
      candidateCompanyId: candidate.id,
      reason: "Sélection de l'entreprise candidate",
    });

    expect(result.candidateCompanyId).toBe(candidate.id);
    expect(auditLogWriter.entries[0]).toMatchObject({
      action: "tender.candidate_company_changed",
      metadata: { previousCandidateCompanyId: undefined, newCandidateCompanyId: candidate.id },
    });
    expect(outboxWriter.writes[0]?.events[0]).toMatchObject({ eventType: "TenderCandidateCompanyChanged" });
  });

  it("never touches clientAccountId when changing candidateCompanyId (the two coexist independently)", async () => {
    const candidate = await createCandidateCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Alpha SARL" });

    const result = await useCase.execute({ organizationId: ORG, tenderId: "tender-1", actorId: ACTOR, actorRole: "ORGANIZATION_ADMIN", candidateCompanyId: candidate.id });

    expect(result.clientAccountId).toBe(DEFAULT_TEST_CLIENT_ACCOUNT_ID);
  });

  it("refuses once the tender has moved past IN_ANALYSIS (domain rule, not duplicated here)", async () => {
    const candidate = await createCandidateCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Alpha SARL" });
    const tender = await tenderRepository.findById({ organizationId: ORG, tenderId: "tender-1" });
    tender!.changeStatus(TenderStatus.InAnalysis, new Date());
    tender!.changeStatus(TenderStatus.Ready, new Date());
    await tenderRepository.save(tender!);

    await expect(
      useCase.execute({ organizationId: ORG, tenderId: "tender-1", actorId: ACTOR, actorRole: "ORGANIZATION_ADMIN", candidateCompanyId: candidate.id }),
    ).rejects.toThrow(TenderCandidateCompanyChangeNotAllowedError);
  });

  it("refuses when the target candidate company is archived", async () => {
    const candidate = await createCandidateCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Alpha SARL" });
    const stored = await candidateCompanyRepository.findById({ organizationId: ORG, candidateCompanyId: candidate.id });
    stored!.archive(new Date());
    await candidateCompanyRepository.save(stored!);

    await expect(
      useCase.execute({ organizationId: ORG, tenderId: "tender-1", actorId: ACTOR, actorRole: "ORGANIZATION_ADMIN", candidateCompanyId: candidate.id }),
    ).rejects.toThrow(CandidateCompanyArchivedError);
  });

  it("refuses when the candidate company does not exist in this organization (cross-tenant included)", async () => {
    await expect(
      useCase.execute({ organizationId: ORG, tenderId: "tender-1", actorId: ACTOR, actorRole: "ORGANIZATION_ADMIN", candidateCompanyId: randomUUID() }),
    ).rejects.toMatchObject({ code: "CANDIDATE_COMPANY_NOT_FOUND" });
  });

  it("refuses a CONTRIBUTOR-tier actor (lacks TenderPermission.Update entirely)", async () => {
    const candidate = await createCandidateCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Alpha SARL" });

    await expect(
      useCase.execute({ organizationId: ORG, tenderId: "tender-1", actorId: ACTOR, actorRole: "CONTRIBUTOR", candidateCompanyId: candidate.id }),
    ).rejects.toMatchObject({ code: "TENDER_PERMISSION_MISSING" });
  });

  it("BLOQUANT (correctif audit round 3, P1) — refuses a BID_MANAGER who holds TenderPermission.Update at the organization tier but has NO client-tier assignment on this Tender's ClientAccount", async () => {
    const candidate = await createCandidateCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Alpha SARL" });
    // "user-outsider" existe dans l'organisation mais n'a AUCUNE affectation sur
    // DEFAULT_TEST_CLIENT_ACCOUNT_ID — exactement le scénario dénoncé par l'audit : un rôle
    // organisation (BID_MANAGER) ne doit jamais suffire seul à muter un Tender d'un client auquel il
    // n'est pas affecté.
    await expect(
      useCase.execute({ organizationId: ORG, tenderId: "tender-1", actorId: "user-outsider", actorRole: "BID_MANAGER", candidateCompanyId: candidate.id }),
    ).rejects.toMatchObject({ code: "CLIENT_ACCOUNT_NOT_FOUND" });

    const tender = await tenderRepository.findById({ organizationId: ORG, tenderId: "tender-1" });
    expect(tender?.candidateCompanyId).toBeUndefined();
  });

  it("allows a BID_MANAGER who DOES have a client-tier assignment on this Tender's ClientAccount", async () => {
    const candidate = await createCandidateCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Alpha SARL" });
    await clientPortfolio.clientAssignmentRepository.create(
      ClientAssignment.create({
        id: "assignment-bid-manager",
        organizationId: ORG,
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        userId: "user-bid-manager",
        role: ClientRole.ClientManager,
        createdBy: ACTOR,
        occurredAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );

    const result = await useCase.execute({
      organizationId: ORG,
      tenderId: "tender-1",
      actorId: "user-bid-manager",
      actorRole: "BID_MANAGER",
      candidateCompanyId: candidate.id,
    });

    expect(result.candidateCompanyId).toBe(candidate.id);
  });

  it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
    const candidate = await createCandidateCompanyUseCase.execute({ organizationId: ORG, actorId: ACTOR, name: "Alpha SARL" });

    await expect(
      useCase.execute({ organizationId: "org-2", tenderId: "tender-1", actorId: ACTOR, actorRole: "ORGANIZATION_ADMIN", candidateCompanyId: candidate.id }),
    ).rejects.toThrow(TenderNotFoundError);
  });
});
