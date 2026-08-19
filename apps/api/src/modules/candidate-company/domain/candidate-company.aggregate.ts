import { CandidateCompanyStatus } from "./candidate-company-status";
import { normalizeCandidateCompanyName } from "./candidate-name-normalizer";
import { CandidateCompanyArchivedError } from "./errors";

export type CandidateCompanyProps = {
  id: string;
  organizationId: string;
  name: string;
  nameNormalized: string;
  legalName?: string | undefined;
  siren?: string | undefined;
  vatNumber?: string | undefined;
  legalForm?: string | undefined;
  status: CandidateCompanyStatus;
  /** MIGRATION_COMPATIBILITY_FIELD (mission §12) — jamais une source de vérité métier, jamais lu
   *  hors du backfill A2. Voir la colonne `source_client_account_id` (migration) : pas de relation
   *  Prisma déclarée, même discipline que `RoutingDecision.analysisId`/`generationId`. */
  sourceClientAccountId?: string | undefined;
  createdBy: string;
  updatedBy?: string | undefined;
  archivedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Entreprise candidate (mission TenderOS 2.1 §"CANDIDATE COMPANY") — la personne morale juridique
 * qui répond réellement aux appels d'offres (SIREN, forme juridique), Source-of-Truth distincte de
 * `ClientAccount` (portefeuille commercial, non touché par cet agrégat). Ne connaît ni Prisma, ni
 * NestJS, ni Next.js — uniquement son propre cycle de vie.
 */
export class CandidateCompany {
  private constructor(private props: CandidateCompanyProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    name: string;
    legalName?: string | undefined;
    siren?: string | undefined;
    vatNumber?: string | undefined;
    legalForm?: string | undefined;
    sourceClientAccountId?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): CandidateCompany {
    return new CandidateCompany({
      id: input.id,
      organizationId: input.organizationId,
      name: input.name,
      nameNormalized: normalizeCandidateCompanyName(input.name),
      legalName: input.legalName,
      siren: input.siren,
      vatNumber: input.vatNumber,
      legalForm: input.legalForm,
      status: CandidateCompanyStatus.Active,
      sourceClientAccountId: input.sourceClientAccountId,
      createdBy: input.createdBy,
      updatedBy: undefined,
      archivedAt: undefined,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: CandidateCompanyProps): CandidateCompany {
    return new CandidateCompany(props);
  }

  private assertNotArchived(): void {
    if (this.props.status === CandidateCompanyStatus.Archived) {
      throw new CandidateCompanyArchivedError();
    }
  }

  /** Idempotent — archiver une entreprise candidate déjà archivée est un no-op silencieux, jamais
   *  une erreur (même motif que `ClientAccount.archive`). */
  archive(occurredAt: Date): void {
    if (this.props.status === CandidateCompanyStatus.Archived) {
      return;
    }
    this.props.status = CandidateCompanyStatus.Archived;
    this.props.archivedAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  /** Idempotent — restaurer une entreprise candidate déjà active est un no-op silencieux. */
  restore(occurredAt: Date): void {
    if (this.props.status !== CandidateCompanyStatus.Archived) {
      return;
    }
    this.props.status = CandidateCompanyStatus.Active;
    this.props.archivedAt = undefined;
    this.props.updatedAt = occurredAt;
  }

  /** Un établissement ne peut être ajouté qu'à une entreprise candidate active. */
  assertCanAddEstablishment(): void {
    this.assertNotArchived();
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get name(): string {
    return this.props.name;
  }
  get nameNormalized(): string {
    return this.props.nameNormalized;
  }
  get legalName(): string | undefined {
    return this.props.legalName;
  }
  get siren(): string | undefined {
    return this.props.siren;
  }
  get vatNumber(): string | undefined {
    return this.props.vatNumber;
  }
  get legalForm(): string | undefined {
    return this.props.legalForm;
  }
  get status(): CandidateCompanyStatus {
    return this.props.status;
  }
  get sourceClientAccountId(): string | undefined {
    return this.props.sourceClientAccountId;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get updatedBy(): string | undefined {
    return this.props.updatedBy;
  }
  get archivedAt(): Date | undefined {
    return this.props.archivedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
