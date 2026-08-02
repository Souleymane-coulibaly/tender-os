import { Inject, Injectable } from "@nestjs/common";
import { GetPricingEstimateUseCase, ListPricingEstimatesUseCase, type PricingEstimateSummary } from "../../../pricing";
import {
  ListSignatureRequirementsUseCase,
  ListSignatureTransactionsUseCase,
  type SignatureRequirementSummary,
  type SignatureTransactionSummary,
} from "../../../signature";
import { ListSubmissionPackagesUseCase, type SubmissionPackageSummary } from "../../../submission-package";
import { GetReadinessStatusUseCase, GetValidationRunUseCase, type ReadinessStatusResult, type ValidationRunSummary } from "../../../validation";
import { DeliverableType } from "../../domain/deliverable-type";
import { DeliverableNotFoundError, UnsupportedReadOnlyDeliverableError } from "../../domain/errors";
import { DELIVERABLE_REPOSITORY, type DeliverableRepository } from "../ports/deliverable.repository";

/**
 * Mission Sprint 8A.1 §14 — quatre livrables PURS LECTURE SEULE, entièrement dérivés d'un autre
 * module déjà validé (Validation Sprint 8A, Pricing Sprint 7, Signature/SubmissionPackage Sprint
 * 8A bis) — "jamais une seconde écriture sur ces données". Chaque use case ci-dessous recharge le
 * `Deliverable` uniquement pour retrouver son `tenderId` et vérifier son `type`, puis délègue
 * ENTIÈREMENT au use case public déjà RBAC-gated du module propriétaire.
 */
async function loadReadOnlyDeliverable(
  repository: DeliverableRepository,
  input: { organizationId: string; deliverableId: string; expectedType: DeliverableType },
) {
  const deliverable = await repository.findById({ organizationId: input.organizationId, deliverableId: input.deliverableId });
  if (!deliverable) {
    throw new DeliverableNotFoundError();
  }
  if (deliverable.type !== input.expectedType) {
    throw new UnsupportedReadOnlyDeliverableError(`this deliverable is not a ${input.expectedType}`);
  }
  return deliverable;
}

export type GetDeliverableValidationReportQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; deliverableId: string }>;
export type DeliverableValidationReport = Readonly<{ readiness: ReadinessStatusResult; latestRun?: ValidationRunSummary | undefined }>;

@Injectable()
export class GetDeliverableValidationReportUseCase {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverableRepository: DeliverableRepository,
    private readonly getReadinessStatusUseCase: GetReadinessStatusUseCase,
    private readonly getValidationRunUseCase: GetValidationRunUseCase,
  ) {}

  async execute(query: GetDeliverableValidationReportQuery): Promise<DeliverableValidationReport> {
    const deliverable = await loadReadOnlyDeliverable(this.deliverableRepository, {
      organizationId: query.organizationId,
      deliverableId: query.deliverableId,
      expectedType: DeliverableType.ValidationReport,
    });
    const readiness = await this.getReadinessStatusUseCase.execute({
      organizationId: query.organizationId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      tenderId: deliverable.tenderId,
    });
    let latestRun: ValidationRunSummary | undefined;
    try {
      latestRun = await this.getValidationRunUseCase.execute({
        organizationId: query.organizationId,
        actorId: query.actorId,
        actorRole: query.actorRole,
        tenderId: deliverable.tenderId,
      });
    } catch {
      latestRun = undefined;
    }
    return { readiness, latestRun };
  }
}

export type GetDeliverableCostReportQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; deliverableId: string }>;
export type DeliverableCostReportView = Readonly<{
  estimate: PricingEstimateSummary;
  /** Correctif audit Codex P1-002 — `true` seulement quand ce rapport référence une version
   *  explicitement figée (`SelectCostReportEstimateUseCase`) ; `false` = comportement historique de
   *  repli (dernière estimation courante), jamais présenté comme une version figée. */
  frozen: boolean;
  selection?: Readonly<{ pricingEstimateId: string; pricingEstimateVersionNumber: number; selectedBy: string; selectedAt: string }> | undefined;
}>;

/** Mission §14 — "utilise UNIQUEMENT les données figées du Sprint 7", jamais un recalcul. Le
 *  disclaimer exact et le statut réel/estimé/partiel/inconnu viennent tels quels de la version
 *  figée retournée par Pricing — jamais reconstruits ici.
 *
 *  Correctif audit Codex P1-002 — si le livrable référence une sélection EXPLICITEMENT figée
 *  (`Deliverable.costReportPricingEstimateId`), cette version précise est relue à chaque
 *  consultation, jamais la dernière estimation courante, même si un nouveau calcul Sprint 7 a eu
 *  lieu entre-temps. Sans sélection encore posée, repli sur le comportement historique (dernière
 *  estimation) — signalé explicitement via `frozen: false`, jamais confondu avec une version figée. */
@Injectable()
export class GetDeliverableCostReportUseCase {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverableRepository: DeliverableRepository,
    private readonly listPricingEstimatesUseCase: ListPricingEstimatesUseCase,
    private readonly getPricingEstimateUseCase: GetPricingEstimateUseCase,
  ) {}

  async execute(query: GetDeliverableCostReportQuery): Promise<DeliverableCostReportView | undefined> {
    const deliverable = await loadReadOnlyDeliverable(this.deliverableRepository, {
      organizationId: query.organizationId,
      deliverableId: query.deliverableId,
      expectedType: DeliverableType.CostReport,
    });

    if (deliverable.costReportPricingEstimateId) {
      const estimate = await this.getPricingEstimateUseCase.execute({
        organizationId: query.organizationId,
        actorId: query.actorId,
        actorRole: query.actorRole,
        estimateId: deliverable.costReportPricingEstimateId,
        version: deliverable.costReportPricingEstimateVersionNumber,
      });
      return {
        estimate,
        frozen: true,
        selection: {
          pricingEstimateId: deliverable.costReportPricingEstimateId,
          pricingEstimateVersionNumber: deliverable.costReportPricingEstimateVersionNumber!,
          selectedBy: deliverable.costReportSelectedBy!,
          selectedAt: deliverable.costReportSelectedAt!.toISOString(),
        },
      };
    }

    const { items } = await this.listPricingEstimatesUseCase.execute({
      organizationId: query.organizationId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      tenderId: deliverable.tenderId,
      limit: 1,
      offset: 0,
    });
    const latest = items[0];
    if (!latest) return undefined;
    const estimate = await this.getPricingEstimateUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, estimateId: latest.id });
    return { estimate, frozen: false };
  }
}

export type GetDeliverableSignatureDocumentsQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; deliverableId: string }>;
export type DeliverableSignatureDocumentsView = Readonly<{ requirements: readonly SignatureRequirementSummary[]; transactions: readonly SignatureTransactionSummary[] }>;

@Injectable()
export class GetDeliverableSignatureDocumentsUseCase {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverableRepository: DeliverableRepository,
    private readonly listSignatureRequirementsUseCase: ListSignatureRequirementsUseCase,
    private readonly listSignatureTransactionsUseCase: ListSignatureTransactionsUseCase,
  ) {}

  async execute(query: GetDeliverableSignatureDocumentsQuery): Promise<DeliverableSignatureDocumentsView> {
    const deliverable = await loadReadOnlyDeliverable(this.deliverableRepository, {
      organizationId: query.organizationId,
      deliverableId: query.deliverableId,
      expectedType: DeliverableType.SignatureDocuments,
    });
    const [requirements, transactions] = await Promise.all([
      this.listSignatureRequirementsUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: deliverable.tenderId }),
      this.listSignatureTransactionsUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: deliverable.tenderId }),
    ]);
    return { requirements, transactions };
  }
}

export type GetDeliverableSubmissionPackageQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; deliverableId: string }>;

@Injectable()
export class GetDeliverableSubmissionPackageUseCase {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverableRepository: DeliverableRepository,
    private readonly listSubmissionPackagesUseCase: ListSubmissionPackagesUseCase,
  ) {}

  async execute(query: GetDeliverableSubmissionPackageQuery): Promise<readonly SubmissionPackageSummary[]> {
    const deliverable = await loadReadOnlyDeliverable(this.deliverableRepository, {
      organizationId: query.organizationId,
      deliverableId: query.deliverableId,
      expectedType: DeliverableType.SubmissionPackage,
    });
    return this.listSubmissionPackagesUseCase.execute({
      organizationId: query.organizationId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      tenderId: deliverable.tenderId,
    });
  }
}
