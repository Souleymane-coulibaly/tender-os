import { ResponsePackageStatus } from "./enums";

export type ResponsePackageProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  lotId?: string | undefined;
  clientAccountId: string;
  status: ResponsePackageStatus;
  currentVersionId?: string | undefined;
  currentVersionNumber: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Racine d'agrégat — un dossier de réponse par (Tender, lot optionnel, candidate). Mission §8 :
 *  jamais mélanger silencieusement les documents de plusieurs lots — `lotId` reste figé après
 *  création (aucune méthode de changement de lot n'est exposée, contrairement à
 *  `ChecklistItem.changeLot`). */
export class ResponsePackage {
  private constructor(private props: ResponsePackageProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    lotId?: string | undefined;
    clientAccountId: string;
    createdBy: string;
    occurredAt: Date;
  }): ResponsePackage {
    return new ResponsePackage({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      lotId: input.lotId,
      clientAccountId: input.clientAccountId,
      status: ResponsePackageStatus.Draft,
      currentVersionNumber: 0,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: ResponsePackageProps): ResponsePackage {
    return new ResponsePackage(props);
  }

  /** Renseigné à chaque nouvelle `ResponsePackageVersion` (mission §51 "document modifié après
   *  validation... Package V3 reste V7" — une nouvelle version démarre toujours DRAFT et doit être
   *  revalidée, même si une version précédente était déjà VALIDATED/EXPORTED). */
  advanceToVersion(input: { versionId: string; versionNumber: number; occurredAt: Date }): void {
    if (input.versionNumber <= this.props.currentVersionNumber) {
      throw new Error("A ResponsePackageVersion number must always increase, never regress.");
    }
    this.props.currentVersionId = input.versionId;
    this.props.currentVersionNumber = input.versionNumber;
    this.props.status = ResponsePackageStatus.Draft;
    this.props.updatedAt = input.occurredAt;
  }

  markReady(occurredAt: Date): void {
    this.props.status = ResponsePackageStatus.Ready;
    this.props.updatedAt = occurredAt;
  }

  markValidated(occurredAt: Date): void {
    this.props.status = ResponsePackageStatus.Validated;
    this.props.updatedAt = occurredAt;
  }

  /** Mission §55 — action EXPLICITE et séparée de la validation, jamais automatique. */
  markExported(occurredAt: Date): void {
    this.props.status = ResponsePackageStatus.Exported;
    this.props.updatedAt = occurredAt;
  }

  invalidate(occurredAt: Date): void {
    this.props.status = ResponsePackageStatus.Invalidated;
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
  get status(): ResponsePackageStatus {
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
