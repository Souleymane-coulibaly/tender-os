import { AdministrativeDossierStatus, AdministrativeDossierValidationStatus } from "./administrative-dossier-status";

export type AdministrativeDossierProps = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  status: AdministrativeDossierStatus;
  completionPercentage: number;
  validationStatus: AdministrativeDossierValidationStatus;
  lastValidatedAt?: Date | undefined;
  lastValidatedBy?: string | undefined;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Sprint 8C Phase 1 — mission §6 : un dossier administratif PRINCIPAL par Tender (création
 * idempotente, voir `EnsureAdministrativeDossierUseCase`). `status`/`completionPercentage` sont
 * CALCULÉS côté backend (voir `deriveAdministrativeDossierStatus`/`computeAdministrativeChecklist`) —
 * cet agrégat expose uniquement un setter de confiance (`applyComputedStatus`), jamais une
 * transition libre appelable depuis un contrôleur. `validationStatus` est un fait humain séparé
 * (mission §6 "séparer strictement complétude / validité / validation humaine / signature /
 * sélection package") — ne code jamais la signature ni la sélection package.
 */
export class AdministrativeDossier {
  private constructor(private props: AdministrativeDossierProps) {}

  static create(input: { id: string; organizationId: string; clientAccountId: string; tenderId: string; occurredAt: Date }): AdministrativeDossier {
    return new AdministrativeDossier({
      id: input.id,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      status: AdministrativeDossierStatus.Incomplete,
      completionPercentage: 0,
      validationStatus: AdministrativeDossierValidationStatus.NotValidated,
      version: 0,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: AdministrativeDossierProps): AdministrativeDossier {
    return new AdministrativeDossier(props);
  }

  /** Appelé UNIQUEMENT par `AdministrativeDossierRecalculationService` — jamais directement par un
   *  contrôleur (mission §6/§15, même discipline que `Deliverable.applyComputedStatus`). Bascule
   *  automatiquement `VALIDATED → OUTDATED` si le recalcul retombe sous `READY` après une
   *  validation humaine antérieure (mission §21 "une modification après validation... invalide ou
   *  rouvre la validation concernée"). */
  applyComputedStatus(input: { status: AdministrativeDossierStatus; completionPercentage: number; occurredAt: Date }): void {
    this.props.status = input.status;
    this.props.completionPercentage = input.completionPercentage;
    if (this.props.validationStatus === AdministrativeDossierValidationStatus.Validated && input.status !== AdministrativeDossierStatus.Ready) {
      this.props.validationStatus = AdministrativeDossierValidationStatus.Outdated;
    }
    this.props.version += 1;
    this.props.updatedAt = input.occurredAt;
  }

  /** Fait explicite humain, jamais déduit automatiquement — appelé UNIQUEMENT après vérification
   *  applicative que le statut courant est `READY` (mission §22, même motif que
   *  `ApproveDeliverableUseCase`). */
  recordHumanValidation(input: { validatedBy: string; occurredAt: Date }): void {
    this.props.validationStatus = AdministrativeDossierValidationStatus.Validated;
    this.props.lastValidatedBy = input.validatedBy;
    this.props.lastValidatedAt = input.occurredAt;
    this.props.version += 1;
    this.props.updatedAt = input.occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get clientAccountId(): string {
    return this.props.clientAccountId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get status(): AdministrativeDossierStatus {
    return this.props.status;
  }
  get completionPercentage(): number {
    return this.props.completionPercentage;
  }
  get validationStatus(): AdministrativeDossierValidationStatus {
    return this.props.validationStatus;
  }
  get lastValidatedAt(): Date | undefined {
    return this.props.lastValidatedAt;
  }
  get lastValidatedBy(): string | undefined {
    return this.props.lastValidatedBy;
  }
  get version(): number {
    return this.props.version;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
