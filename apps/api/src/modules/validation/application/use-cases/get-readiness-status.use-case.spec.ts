import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AssertClientAccessUseCase } from "../../../client-portfolio";
import type { SignatureRequirementRepository, SignatureTransactionRepository } from "../../../signature";
import type { GetTenderUseCase } from "../../../tenders";
import { ReadinessStatus } from "../../domain/readiness-status";
import { GetReadinessStatusUseCase } from "./get-readiness-status.use-case";
import type { FinalApprovalRepository } from "../ports/final-approval.repository";
import type { ValidationRunRepository } from "../ports/validation-run.repository";

type FakeRequirement = { mandatory: boolean; status: string };
type FakeTransaction = { transaction: { status: string } };

function buildUseCase(input: {
  activeApproval?: { id: string } | null;
  requirements?: FakeRequirement[];
  transactions?: FakeTransaction[];
  latestRun?: { id: string; readinessStatus: string } | null;
}) {
  const organizationId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();

  const finalApprovalRepository: Pick<FinalApprovalRepository, "findActiveForTender"> = {
    findActiveForTender: vi.fn(async () => (input.activeApproval === undefined ? null : (input.activeApproval as never))),
  };

  const validationRunRepository: Pick<ValidationRunRepository, "list"> = {
    list: vi.fn(async () => ({
      items: input.latestRun ? [input.latestRun as never] : [],
      total: input.latestRun ? 1 : 0,
    })),
  };

  const signatureRequirementRepository: Pick<SignatureRequirementRepository, "listForTender"> = {
    listForTender: vi.fn(async () => (input.requirements ?? []) as never),
  };

  const signatureTransactionRepository: Pick<SignatureTransactionRepository, "listForTender"> = {
    listForTender: vi.fn(async () => (input.transactions ?? []) as never),
  };

  const getTenderUseCase: Pick<GetTenderUseCase, "execute"> = {
    execute: vi.fn(async () => ({ clientAccountId }) as never),
  };

  const assertClientAccessUseCase: Pick<AssertClientAccessUseCase, "execute"> = {
    execute: vi.fn(async () => undefined),
  };

  const useCase = new GetReadinessStatusUseCase(
    validationRunRepository as ValidationRunRepository,
    finalApprovalRepository as FinalApprovalRepository,
    signatureRequirementRepository as SignatureRequirementRepository,
    signatureTransactionRepository as SignatureTransactionRepository,
    getTenderUseCase as GetTenderUseCase,
    assertClientAccessUseCase as AssertClientAccessUseCase,
  );

  return { useCase, organizationId, tenderId };
}

/**
 * Mission Sprint 8A.2 (correction bug #5 — "reste bloqué sur 'en attente d'approbation' après
 * signature") — prouve que `GetReadinessStatusUseCase` réconcilie désormais l'état réel de la
 * signature une fois une approbation active trouvée, au lieu de renvoyer APPROVED indéfiniment.
 */
describe("GetReadinessStatusUseCase — réconciliation signature (bug #5)", () => {
  it("renvoie NOT_READY quand aucun run de validation n'existe encore", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({ activeApproval: null, latestRun: null });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.status).toBe(ReadinessStatus.NotReady);
  });

  it("renvoie le statut persisté du dernier run tant qu'aucune approbation active n'existe", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      activeApproval: null,
      latestRun: { id: "run-1", readinessStatus: ReadinessStatus.ReadyForApproval },
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.status).toBe(ReadinessStatus.ReadyForApproval);
  });

  it("reste APPROVED quand aucune exigence de signature n'est confirmée pour ce dossier (signature non requise)", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      activeApproval: { id: "approval-1" },
      requirements: [{ mandatory: true, status: "PENDING" }],
      transactions: [],
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.status).toBe(ReadinessStatus.Approved);
  });

  it("passe à READY_FOR_SIGNATURE quand la signature est requise mais aucune transaction n'a encore été créée", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      activeApproval: { id: "approval-1" },
      requirements: [{ mandatory: true, status: "CONFIRMED" }],
      transactions: [],
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.status).toBe(ReadinessStatus.ReadyForSignature);
  });

  it("passe à SIGNATURE_IN_PROGRESS quand une transaction est en cours mais personne n'a encore signé", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      activeApproval: { id: "approval-1" },
      requirements: [{ mandatory: true, status: "CONFIRMED" }],
      transactions: [{ transaction: { status: "SENT" } }],
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.status).toBe(ReadinessStatus.SignatureInProgress);
  });

  it("mission bug #5 — passe à PARTIALLY_SIGNED une fois qu'un signataire a signé mais que tout n'est pas VERIFIED (le cœur du bug signalé)", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      activeApproval: { id: "approval-1" },
      requirements: [{ mandatory: true, status: "CONFIRMED" }],
      transactions: [{ transaction: { status: "SIGNED" } }, { transaction: { status: "SENT" } }],
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.status).toBe(ReadinessStatus.PartiallySigned);
  });

  it("passe à READY_FOR_SUBMISSION exactement quand CreateSubmissionPackageUseCase accepterait de constituer un package (même seuil)", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      activeApproval: { id: "approval-1" },
      requirements: [{ mandatory: true, status: "CONFIRMED" }],
      transactions: [{ transaction: { status: "VERIFIED" } }, { transaction: { status: "DECLINED" } }],
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.status).toBe(ReadinessStatus.ReadyForSubmission);
  });

  it("passe à BLOCKED quand toutes les transactions ont échoué sans qu'aucune ne soit vérifiée", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      activeApproval: { id: "approval-1" },
      requirements: [{ mandatory: true, status: "CONFIRMED" }],
      transactions: [{ transaction: { status: "DECLINED" } }, { transaction: { status: "EXPIRED" } }],
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.status).toBe(ReadinessStatus.Blocked);
  });

  it("expose toujours activeApprovalId aux côtés du statut réconcilié", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      activeApproval: { id: "approval-42" },
      requirements: [],
      transactions: [],
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.activeApprovalId).toBe("approval-42");
  });
});
