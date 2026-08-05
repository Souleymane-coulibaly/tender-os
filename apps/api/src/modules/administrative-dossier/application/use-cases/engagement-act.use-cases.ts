import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { GetPricingEstimateUseCase } from "../../../pricing";
import { EngagementAct } from "../../domain/engagement-act.aggregate";
import { EngagementActNotFoundError, PricingEstimateNotForThisTenderError } from "../../domain/errors";
import { EngagementActSummary, toEngagementActSummary } from "../dtos-structured";
import { ENGAGEMENT_ACT_REPOSITORY, type EngagementActRepository } from "../ports/engagement-act.repository";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";

export type EnsureEngagementActCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/** Mission §14 — un Acte d'engagement par Tender, création idempotente. */
@Injectable()
export class EnsureEngagementActUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ENGAGEMENT_ACT_REPOSITORY) private readonly repository: EngagementActRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: EnsureEngagementActCommand): Promise<EngagementActSummary> {
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, permission: ClientPermission.ManageAdministrativeDossier });
    const existing = await this.repository.findByTenderId({ organizationId: command.organizationId, tenderId: command.tenderId });
    if (existing) return toEngagementActSummary(existing);

    const act = EngagementAct.create({ id: this.idGenerator.generate(), organizationId: command.organizationId, tenderId: command.tenderId, createdBy: command.actorId, occurredAt: this.clock.now() });
    await this.repository.create(act);
    return toEngagementActSummary(act);
  }
}

export type UpdateEngagementActCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  engagementActId: string;
  reference?: string | undefined;
  lotReference?: string | undefined;
  object?: string | undefined;
  durationMonths?: number | undefined;
  variants?: string | undefined;
  subcontractingSummary?: string | undefined;
  ribDocumentId?: string | undefined;
  signatoryName?: string | undefined;
  signatoryCapacity?: string | undefined;
  administrativeDocumentId?: string | undefined;
}>;

@Injectable()
export class UpdateEngagementActUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ENGAGEMENT_ACT_REPOSITORY) private readonly repository: EngagementActRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateEngagementActCommand): Promise<EngagementActSummary> {
    const act = await this.repository.findById({ organizationId: command.organizationId, engagementActId: command.engagementActId });
    if (!act) throw new EngagementActNotFoundError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: act.tenderId, permission: ClientPermission.ManageAdministrativeDossier });

    const occurredAt = this.clock.now();
    act.update({
      reference: command.reference,
      lotReference: command.lotReference,
      object: command.object,
      durationMonths: command.durationMonths,
      variants: command.variants,
      subcontractingSummary: command.subcontractingSummary,
      ribDocumentId: command.ribDocumentId,
      signatoryName: command.signatoryName,
      signatoryCapacity: command.signatoryCapacity,
      occurredAt,
    });
    if (command.administrativeDocumentId !== undefined) {
      act.linkDocument({ administrativeDocumentId: command.administrativeDocumentId, occurredAt });
    }
    await this.repository.save(act);
    return toEngagementActSummary(act);
  }
}

export type FreezeEngagementActPricingCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; engagementActId: string; pricingEstimateId: string; pricingEstimateVersionNumber: number }>;

/** Correctif audit Codex P1-002 (même motif exact que `SelectCostReportEstimateUseCase`) — le
 *  montant de l'Acte d'engagement provient TOUJOURS d'une version de pricing explicitement
 *  sélectionnée, jamais la dernière implicite. Réutilise `GetPricingEstimateUseCase`, jamais une
 *  seconde lecture directe de la table Pricing. */
@Injectable()
export class FreezeEngagementActPricingUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ENGAGEMENT_ACT_REPOSITORY) private readonly repository: EngagementActRepository,
    private readonly getPricingEstimateUseCase: GetPricingEstimateUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: FreezeEngagementActPricingCommand): Promise<EngagementActSummary> {
    const act = await this.repository.findById({ organizationId: command.organizationId, engagementActId: command.engagementActId });
    if (!act) throw new EngagementActNotFoundError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: act.tenderId, permission: ClientPermission.ManageAdministrativeDossier });

    const estimate = await this.getPricingEstimateUseCase.execute({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      estimateId: command.pricingEstimateId,
      version: command.pricingEstimateVersionNumber,
    });
    if (estimate.tenderId && estimate.tenderId !== act.tenderId) {
      throw new PricingEstimateNotForThisTenderError();
    }

    const occurredAt = this.clock.now();
    act.freezePricing({
      pricingEstimateId: command.pricingEstimateId,
      pricingEstimateVersionNumber: command.pricingEstimateVersionNumber,
      amountValue: Number.parseFloat(estimate.currentVersion.amount),
      amountCurrency: estimate.currentVersion.currency,
      frozenBy: command.actorId,
      occurredAt,
    });
    await this.repository.save(act);
    return toEngagementActSummary(act);
  }
}

export type UnfreezeEngagementActPricingCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; engagementActId: string }>;

@Injectable()
export class UnfreezeEngagementActPricingUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ENGAGEMENT_ACT_REPOSITORY) private readonly repository: EngagementActRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UnfreezeEngagementActPricingCommand): Promise<EngagementActSummary> {
    const act = await this.repository.findById({ organizationId: command.organizationId, engagementActId: command.engagementActId });
    if (!act) throw new EngagementActNotFoundError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: act.tenderId, permission: ClientPermission.ManageAdministrativeDossier });

    act.unfreezePricing(this.clock.now());
    await this.repository.save(act);
    return toEngagementActSummary(act);
  }
}

export type GetEngagementActQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

@Injectable()
export class GetEngagementActUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(ENGAGEMENT_ACT_REPOSITORY) private readonly repository: EngagementActRepository,
  ) {}

  async execute(query: GetEngagementActQuery): Promise<EngagementActSummary | null> {
    await this.accessService.assertTenderAccess({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId, permission: ClientPermission.ReadAdministrativeDossier });
    const act = await this.repository.findByTenderId({ organizationId: query.organizationId, tenderId: query.tenderId });
    return act ? toEngagementActSummary(act) : null;
  }
}
