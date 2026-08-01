import { PricingEstimateArchivedError, InvalidPricingScopeError } from "./errors";
import { PricingStatus } from "./pricing-status";
import { PricingType } from "./pricing-type";

export type PricingEstimateProps = {
  id: string;
  organizationId: string;
  /** Au moins l'un de `clientAccountId`/`tenderId` doit être renseigné pour un type scopé
   *  (TENDER_ESTIMATE/GENERATION_ESTIMATE) — `ORGANIZATION_COST_SUMMARY` peut n'avoir ni l'un ni
   *  l'autre (mission §"pour OWNER et ADMIN"). Jamais un Tender d'une autre organisation ni un
   *  client d'une autre organisation (AUDIT-007, vérifié par l'infrastructure au moment de la
   *  lecture réelle du Tender/ClientAccount, jamais une simple confiance dans l'id fourni). */
  clientAccountId?: string | undefined;
  tenderId?: string | undefined;
  type: PricingType;
  status: PricingStatus;
  currentVersionId?: string | undefined;
  currentVersionNumber: number;
  createdBy: string;
  createdAt: Date;
  archivedAt?: Date | undefined;
};

/**
 * En-tête stable d'une estimation (mission Sprint 7 §"Versionnement") — porte l'identité et le
 * périmètre (organisation/client/Tender/type), jamais le montant ni le détail : ceux-ci vivent
 * exclusivement sur `PricingEstimateVersion`. `currentVersionId`/`currentVersionNumber` pointent
 * TOUJOURS vers la version de référence la plus récente, jamais une version archivée en silence.
 */
export class PricingEstimate {
  private constructor(private props: PricingEstimateProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    clientAccountId?: string | undefined;
    tenderId?: string | undefined;
    type: PricingType;
    createdBy: string;
    occurredAt: Date;
  }): PricingEstimate {
    if (input.type !== PricingType.OrganizationCostSummary && !input.clientAccountId && !input.tenderId) {
      throw new InvalidPricingScopeError("a scoped pricing estimate requires a clientAccountId or a tenderId");
    }
    return new PricingEstimate({
      id: input.id,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      type: input.type,
      status: PricingStatus.Draft,
      currentVersionNumber: 0,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: PricingEstimateProps): PricingEstimate {
    return new PricingEstimate(props);
  }

  /** Appelée juste après la création d'une nouvelle `PricingEstimateVersion` (première version ou
   *  recalcul) — jamais avant, jamais deux fois pour la même version. */
  attachVersion(input: { versionId: string; versionNumber: number; status: PricingStatus }): void {
    if (this.props.status === PricingStatus.Archived) {
      throw new PricingEstimateArchivedError();
    }
    this.props.currentVersionId = input.versionId;
    this.props.currentVersionNumber = input.versionNumber;
    this.props.status = input.status;
  }

  archive(occurredAt: Date): void {
    if (this.props.status === PricingStatus.Archived) {
      throw new PricingEstimateArchivedError();
    }
    this.props.status = PricingStatus.Archived;
    this.props.archivedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get clientAccountId(): string | undefined {
    return this.props.clientAccountId;
  }
  get tenderId(): string | undefined {
    return this.props.tenderId;
  }
  get type(): PricingType {
    return this.props.type;
  }
  get status(): PricingStatus {
    return this.props.status;
  }
  get currentVersionId(): string | undefined {
    return this.props.currentVersionId;
  }
  get currentVersionNumber(): number {
    return this.props.currentVersionNumber;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get archivedAt(): Date | undefined {
    return this.props.archivedAt;
  }
}
