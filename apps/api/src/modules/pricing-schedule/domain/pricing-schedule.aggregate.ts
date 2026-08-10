import { FinancialDocumentType, PricingScheduleStatus } from "./enums";

export type PricingScheduleProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  lotId?: string | undefined;
  clientAccountId: string;
  financialDocumentType: FinancialDocumentType;
  sourceDocumentId: string;
  sourceDocumentVersionId: string;
  status: PricingScheduleStatus;
  currentVersionId?: string | undefined;
  currentVersionNumber: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Racine d'agrégat — un chiffrage par (Tender, lot optionnel, candidate, fichier source). Mission
 *  §9 : le classeur acheteur original (`sourceDocumentId`/`sourceDocumentVersionId`) n'est référencé
 *  ici qu'en LECTURE SEULE, jamais modifié — la génération du fichier final travaille toujours sur
 *  une COPIE (voir `GenerateFinancialFileUseCase`). Mission §69 : `clientAccountId` n'est jamais
 *  réévalué implicitement, un chiffrage reste attaché à un seul candidat pour toute sa vie. */
export class PricingSchedule {
  private constructor(private props: PricingScheduleProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    lotId?: string | undefined;
    clientAccountId: string;
    financialDocumentType: FinancialDocumentType;
    sourceDocumentId: string;
    sourceDocumentVersionId: string;
    createdBy: string;
    occurredAt: Date;
  }): PricingSchedule {
    return new PricingSchedule({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      lotId: input.lotId,
      clientAccountId: input.clientAccountId,
      financialDocumentType: input.financialDocumentType,
      sourceDocumentId: input.sourceDocumentId,
      sourceDocumentVersionId: input.sourceDocumentVersionId,
      status: PricingScheduleStatus.Draft,
      currentVersionNumber: 0,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: PricingScheduleProps): PricingSchedule {
    return new PricingSchedule(props);
  }

  /** Renseigné à chaque nouvelle `PricingScheduleVersion` créée (mission §22) — le numéro de version
   *  ne peut que croître, jamais régresser. Ramène toujours le statut à READY : une version qui
   *  vient d'être créée démarre DRAFT et doit être revalidée, même si une version précédente était
   *  déjà VALIDATED/EXPORTED (mission §45 "create new version" pour tout changement de prix). */
  advanceToVersion(input: { versionId: string; versionNumber: number; occurredAt: Date }): void {
    if (input.versionNumber <= this.props.currentVersionNumber) {
      throw new Error("A PricingScheduleVersion number must always increase, never regress.");
    }
    this.props.currentVersionId = input.versionId;
    this.props.currentVersionNumber = input.versionNumber;
    this.props.status = PricingScheduleStatus.Ready;
    this.props.updatedAt = input.occurredAt;
  }

  /** Dénormalisation depuis `PricingScheduleVersion.validate()` (mission §43) — jamais appelé
   *  indépendamment d'une validation de version réelle. */
  markValidated(occurredAt: Date): void {
    this.props.status = PricingScheduleStatus.Validated;
    this.props.updatedAt = occurredAt;
  }

  /** Mission §"génération explicite" — au moins un fichier financier final a été produit pour la
   *  version courante validée. Jamais déclenché automatiquement par `markValidated`. */
  markExported(occurredAt: Date): void {
    this.props.status = PricingScheduleStatus.Exported;
    this.props.updatedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get lotId(): string | undefined {
    return this.props.lotId;
  }
  get clientAccountId(): string {
    return this.props.clientAccountId;
  }
  get financialDocumentType(): FinancialDocumentType {
    return this.props.financialDocumentType;
  }
  get sourceDocumentId(): string {
    return this.props.sourceDocumentId;
  }
  get sourceDocumentVersionId(): string {
    return this.props.sourceDocumentVersionId;
  }
  get status(): PricingScheduleStatus {
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
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
