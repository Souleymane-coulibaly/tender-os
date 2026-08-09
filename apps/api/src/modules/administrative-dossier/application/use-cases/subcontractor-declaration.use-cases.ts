import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import type { AdministrativeDocumentType } from "../../domain/administrative-document-type";
import { SubcontractorAmountInconsistentWithPricingError, SubcontractorDeclarationNotFoundError } from "../../domain/errors";
import { SubcontractorDeclaration } from "../../domain/subcontractor-declaration.aggregate";
import { SubcontractorDeclarationSummary, toSubcontractorDeclarationSummary } from "../dtos-structured";
import { ENGAGEMENT_ACT_REPOSITORY, type EngagementActRepository } from "../ports/engagement-act.repository";
import { SUBCONTRACTOR_DECLARATION_REPOSITORY, type SubcontractorDeclarationRepository } from "../ports/subcontractor-declaration.repository";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";

/** Mission §12 — "cohérence montant/pourcentage" avec le pricing gelé de l'Acte d'engagement.
 *  Tolérance de 1% pour absorber les arrondis, jamais une égalité stricte fragile. Silencieux si
 *  aucun Acte d'engagement n'est encore gelé pour ce Tender — rien à comparer. */
async function assertConsistentWithFrozenPricing(input: { organizationId: string; tenderId: string; amountValue: number; percentageOfTotal?: number | undefined; engagementActRepository: EngagementActRepository }): Promise<void> {
  if (input.percentageOfTotal === undefined) return;
  const act = await input.engagementActRepository.findByTenderId({ organizationId: input.organizationId, tenderId: input.tenderId });
  if (!act || act.frozenAmountValue === undefined) return;
  const expected = (act.frozenAmountValue * input.percentageOfTotal) / 100;
  const tolerance = Math.max(expected * 0.01, 0.01);
  if (Math.abs(input.amountValue - expected) > tolerance) {
    throw new SubcontractorAmountInconsistentWithPricingError();
  }
}

export type CreateSubcontractorDeclarationCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  subcontractorName: string;
  subcontractorLegalIdentifier?: string | undefined;
  servicesDescription: string;
  amountValue: number;
  amountCurrency: string;
  percentageOfTotal?: number | undefined;
  paymentTerms?: string | undefined;
  directPaymentApplicable?: boolean | undefined;
  requiredDocuments?: readonly AdministrativeDocumentType[] | undefined;
  subcontractorProfileId?: string | undefined;
  durationMonths?: number | undefined;
}>;

/** Mission §12 — "plusieurs DC4 doivent être possibles" : jamais un seul par Tender. */
@Injectable()
export class CreateSubcontractorDeclarationUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(SUBCONTRACTOR_DECLARATION_REPOSITORY) private readonly repository: SubcontractorDeclarationRepository,
    @Inject(ENGAGEMENT_ACT_REPOSITORY) private readonly engagementActRepository: EngagementActRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateSubcontractorDeclarationCommand): Promise<SubcontractorDeclarationSummary> {
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, permission: ClientPermission.ManageAdministrativeDossier });
    await assertConsistentWithFrozenPricing({ organizationId: command.organizationId, tenderId: command.tenderId, amountValue: command.amountValue, percentageOfTotal: command.percentageOfTotal, engagementActRepository: this.engagementActRepository });

    const declaration = SubcontractorDeclaration.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      subcontractorName: command.subcontractorName,
      subcontractorLegalIdentifier: command.subcontractorLegalIdentifier,
      servicesDescription: command.servicesDescription,
      amountValue: command.amountValue,
      amountCurrency: command.amountCurrency,
      percentageOfTotal: command.percentageOfTotal,
      paymentTerms: command.paymentTerms,
      directPaymentApplicable: command.directPaymentApplicable,
      requiredDocuments: command.requiredDocuments,
      subcontractorProfileId: command.subcontractorProfileId,
      durationMonths: command.durationMonths,
      createdBy: command.actorId,
      occurredAt: this.clock.now(),
    });
    await this.repository.create(declaration);
    return toSubcontractorDeclarationSummary(declaration);
  }
}

export type UpdateSubcontractorDeclarationCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  subcontractorDeclarationId: string;
  subcontractorName?: string | undefined;
  servicesDescription?: string | undefined;
  amountValue?: number | undefined;
  amountCurrency?: string | undefined;
  percentageOfTotal?: number | undefined;
  paymentTerms?: string | undefined;
  directPaymentApplicable?: boolean | undefined;
  administrativeDocumentId?: string | undefined;
  durationMonths?: number | undefined;
}>;

@Injectable()
export class UpdateSubcontractorDeclarationUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(SUBCONTRACTOR_DECLARATION_REPOSITORY) private readonly repository: SubcontractorDeclarationRepository,
    @Inject(ENGAGEMENT_ACT_REPOSITORY) private readonly engagementActRepository: EngagementActRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateSubcontractorDeclarationCommand): Promise<SubcontractorDeclarationSummary> {
    const declaration = await this.repository.findById({ organizationId: command.organizationId, subcontractorDeclarationId: command.subcontractorDeclarationId });
    if (!declaration) throw new SubcontractorDeclarationNotFoundError();

    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: declaration.tenderId, permission: ClientPermission.ManageAdministrativeDossier });

    const nextAmount = command.amountValue ?? declaration.amountValue;
    const nextPercentage = command.percentageOfTotal ?? declaration.percentageOfTotal;
    await assertConsistentWithFrozenPricing({ organizationId: command.organizationId, tenderId: declaration.tenderId, amountValue: nextAmount, percentageOfTotal: nextPercentage, engagementActRepository: this.engagementActRepository });

    const occurredAt = this.clock.now();
    declaration.update({
      subcontractorName: command.subcontractorName,
      servicesDescription: command.servicesDescription,
      amountValue: command.amountValue,
      amountCurrency: command.amountCurrency,
      percentageOfTotal: command.percentageOfTotal,
      paymentTerms: command.paymentTerms,
      directPaymentApplicable: command.directPaymentApplicable,
      durationMonths: command.durationMonths,
      occurredAt,
    });
    if (command.administrativeDocumentId !== undefined) {
      declaration.linkDocument({ administrativeDocumentId: command.administrativeDocumentId, occurredAt });
    }
    await this.repository.save(declaration);
    return toSubcontractorDeclarationSummary(declaration);
  }
}

export type ListSubcontractorDeclarationsQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

@Injectable()
export class ListSubcontractorDeclarationsUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(SUBCONTRACTOR_DECLARATION_REPOSITORY) private readonly repository: SubcontractorDeclarationRepository,
  ) {}

  async execute(query: ListSubcontractorDeclarationsQuery): Promise<readonly SubcontractorDeclarationSummary[]> {
    await this.accessService.assertTenderAccess({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId, permission: ClientPermission.ReadAdministrativeDossier });
    const declarations = await this.repository.listByTenderId({ organizationId: query.organizationId, tenderId: query.tenderId });
    return declarations.map(toSubcontractorDeclarationSummary);
  }
}
