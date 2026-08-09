export const Dc1CandidateType = {
  Individual: "INDIVIDUAL",
  Consortium: "CONSORTIUM",
} as const;

export type Dc1CandidateType = (typeof Dc1CandidateType)[keyof typeof Dc1CandidateType];

export type Dc1DeclarationProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  candidateType: Dc1CandidateType;
  consortiumId?: string | undefined;
  declarations?: string | undefined;
  signatoryName?: string | undefined;
  signatoryCapacity?: string | undefined;
  signingPowerId?: string | undefined;
  administrativeDocumentId?: string | undefined;
  /** V2 Sprint 11 — rubrique F du DC1 réel : attestation sur l'honneur d'absence de motif
   *  d'exclusion. `undefined` tant que non déclarée — jamais présumée `true` (mission "jamais une
   *  valeur inventée"). */
  exclusionAttestation?: boolean | undefined;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Sprint 8C Phase 2 — mission §10 : lettre de candidature, une par Tender (idempotence assurée par
 * le use case + `@@unique([organizationId, tenderId])`, même motif que `AdministrativeDossier`).
 * Réutilise les sources Organisation/Client existantes pour l'identité du candidat — cet agrégat ne
 * duplique JAMAIS ces données, seulement les faits propres au DC1 (type de candidature, mandataire
 * via `consortiumId`, signataire). Le "document généré ou importé" et sa "version" sont portés par
 * l'`AdministrativeDocument`/`AdministrativeDocumentRevision` référencé — jamais un second
 * mécanisme de version ici.
 */
export class Dc1Declaration {
  private constructor(private props: Dc1DeclarationProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    candidateType: Dc1CandidateType;
    consortiumId?: string | undefined;
    declarations?: string | undefined;
    signatoryName?: string | undefined;
    signatoryCapacity?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): Dc1Declaration {
    return new Dc1Declaration({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      candidateType: input.candidateType,
      consortiumId: input.candidateType === Dc1CandidateType.Consortium ? input.consortiumId : undefined,
      declarations: input.declarations,
      signatoryName: input.signatoryName,
      signatoryCapacity: input.signatoryCapacity,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: Dc1DeclarationProps): Dc1Declaration {
    return new Dc1Declaration(props);
  }

  update(input: {
    candidateType?: Dc1CandidateType | undefined;
    consortiumId?: string | undefined;
    declarations?: string | undefined;
    signatoryName?: string | undefined;
    signatoryCapacity?: string | undefined;
    signingPowerId?: string | undefined;
    exclusionAttestation?: boolean | undefined;
    occurredAt: Date;
  }): void {
    if (input.candidateType !== undefined) this.props.candidateType = input.candidateType;
    if (input.consortiumId !== undefined) this.props.consortiumId = input.consortiumId;
    if (input.declarations !== undefined) this.props.declarations = input.declarations;
    if (input.signatoryName !== undefined) this.props.signatoryName = input.signatoryName;
    if (input.signatoryCapacity !== undefined) this.props.signatoryCapacity = input.signatoryCapacity;
    if (input.signingPowerId !== undefined) this.props.signingPowerId = input.signingPowerId;
    if (input.exclusionAttestation !== undefined) this.props.exclusionAttestation = input.exclusionAttestation;
    if (this.props.candidateType === Dc1CandidateType.Individual) this.props.consortiumId = undefined;
    this.props.updatedAt = input.occurredAt;
  }

  linkDocument(input: { administrativeDocumentId: string; occurredAt: Date }): void {
    this.props.administrativeDocumentId = input.administrativeDocumentId;
    this.props.updatedAt = input.occurredAt;
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
  get candidateType(): Dc1CandidateType {
    return this.props.candidateType;
  }
  get consortiumId(): string | undefined {
    return this.props.consortiumId;
  }
  get declarations(): string | undefined {
    return this.props.declarations;
  }
  get signatoryName(): string | undefined {
    return this.props.signatoryName;
  }
  get signatoryCapacity(): string | undefined {
    return this.props.signatoryCapacity;
  }
  get signingPowerId(): string | undefined {
    return this.props.signingPowerId;
  }
  get administrativeDocumentId(): string | undefined {
    return this.props.administrativeDocumentId;
  }
  get exclusionAttestation(): boolean | undefined {
    return this.props.exclusionAttestation;
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
