import { PricingScheduleVersionValidatedError } from "./errors";
import { PricingScheduleVersionStatus } from "./enums";

export type PricingScheduleVersionProps = {
  id: string;
  organizationId: string;
  pricingScheduleId: string;
  versionNumber: number;
  status: PricingScheduleVersionStatus;
  sourceDocumentVersionId: string;
  mappingVersion: number;
  createdBy: string;
  createdAt: Date;
  validatedBy?: string | undefined;
  validatedAt?: Date | undefined;
};

/** Historique APPEND-ONLY (mission §22 "V1, V2, V3-VALIDATED... jamais écraser une version
 *  validée") — une fois VALIDATED (mission §45), cette version devient IMMUABLE : toute
 *  modification de prix ultérieure exige la création d'une NOUVELLE version, jamais une mutation de
 *  celle-ci. `sourceDocumentVersionId` est figé à la création (mission §8/§23), jamais recalculé si
 *  le Document source avance ensuite. */
export class PricingScheduleVersion {
  private constructor(private props: PricingScheduleVersionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    pricingScheduleId: string;
    versionNumber: number;
    sourceDocumentVersionId: string;
    mappingVersion?: number | undefined;
    createdBy: string;
    occurredAt: Date;
  }): PricingScheduleVersion {
    return new PricingScheduleVersion({
      id: input.id,
      organizationId: input.organizationId,
      pricingScheduleId: input.pricingScheduleId,
      versionNumber: input.versionNumber,
      status: PricingScheduleVersionStatus.Draft,
      sourceDocumentVersionId: input.sourceDocumentVersionId,
      mappingVersion: input.mappingVersion ?? 1,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: PricingScheduleVersionProps): PricingScheduleVersion {
    return new PricingScheduleVersion(props);
  }

  private assertNotValidated(): void {
    if (this.props.status === PricingScheduleVersionStatus.Validated) {
      throw new PricingScheduleVersionValidatedError();
    }
  }

  markInReview(): void {
    this.assertNotValidated();
    this.props.status = PricingScheduleVersionStatus.InReview;
  }

  /** Mission §45 — état terminal. Aucune méthode de cet agrégat ne permet de revenir en arrière
   *  depuis VALIDATED : c'est structurellement impossible une fois cet appel effectué. */
  validate(input: { validatedBy: string; occurredAt: Date }): void {
    this.assertNotValidated();
    this.props.status = PricingScheduleVersionStatus.Validated;
    this.props.validatedBy = input.validatedBy;
    this.props.validatedAt = input.occurredAt;
  }

  /** Mission §14 — correction du mapping colonnes/feuille AVANT validation uniquement ; jamais
   *  recalculée en silence pour une version déjà créée sans action explicite de l'utilisateur. */
  correctMapping(newMappingVersion: number): void {
    this.assertNotValidated();
    if (newMappingVersion <= this.props.mappingVersion) {
      throw new Error("mappingVersion must always increase, never regress.");
    }
    this.props.mappingVersion = newMappingVersion;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get pricingScheduleId(): string {
    return this.props.pricingScheduleId;
  }
  get versionNumber(): number {
    return this.props.versionNumber;
  }
  get status(): PricingScheduleVersionStatus {
    return this.props.status;
  }
  get sourceDocumentVersionId(): string {
    return this.props.sourceDocumentVersionId;
  }
  get mappingVersion(): number {
    return this.props.mappingVersion;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get validatedBy(): string | undefined {
    return this.props.validatedBy;
  }
  get validatedAt(): Date | undefined {
    return this.props.validatedAt;
  }
  get isValidated(): boolean {
    return this.props.status === PricingScheduleVersionStatus.Validated;
  }
}
