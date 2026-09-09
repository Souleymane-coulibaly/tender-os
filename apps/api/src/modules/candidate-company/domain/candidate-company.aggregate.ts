import { CandidateCompanyStatus } from "./candidate-company-status";
import { normalizeCandidateCompanyName } from "./candidate-name-normalizer";
import { CandidateCompanyArchivedError } from "./errors";

export type CandidateCompanyProps = {
  id: string;
  organizationId: string;
  name: string;
  nameNormalized: string;
  legalName?: string | undefined;
  /// Checkpoint TENDEROS-2.1-CCV2-F.2 — nom COMMERCIAL/d'usage, strictement distinct de `legalName`
  /// (raison sociale). La colonne existe depuis CCV2-B (backfillée depuis
  /// `CompanyLegalIdentity.tradeName`) mais n'était portée ni par l'agrégat ni par le mapper : la
  /// donnée était donc écrite par la migration puis inaccessible. Elle devient ici lisible et
  /// maintenable. AUCUN consommateur n'est repointé pour autant (le DC1 continue de servir
  /// `legalName ?? name` — décision CCV2-B §16, hors périmètre de ce checkpoint).
  tradeName?: string | undefined;
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
    tradeName?: string | undefined;
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
      tradeName: input.tradeName,
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

  /**
   * Checkpoint TENDEROS-2.1-CCV2-F.2 — mise à jour de l'IDENTITÉ JURIDIQUE, native CandidateCompany.
   *
   * LISTE BLANCHE EXPLICITE, jamais un étalement de DTO : seuls les six champs ci-dessous sont
   * mutables. `organizationId`, `sourceClientAccountId`, `status`, `createdBy`/`createdAt`,
   * `archivedAt` et `nameNormalized` ne peuvent structurellement PAS être atteints par un appelant —
   * ils ne figurent pas dans le type du patch, donc aucune valeur hostile ne peut les toucher, même
   * si elle traversait la validation HTTP.
   *
   * `nameNormalized` est RECALCULÉ depuis `name`, jamais accepté de l'extérieur : il porte
   * l'unicité `(organizationId, nameNormalized)` en base, le laisser diverger du nom romprait cette
   * garantie sans qu'aucune contrainte ne s'en aperçoive.
   *
   * Sémantique `undefined` vs `null` : `undefined` = "champ non fourni, ne pas toucher" ;
   * `null` = "effacer explicitement". Sans cette distinction il serait impossible de vider un
   * champ optionnel une fois renseigné.
   *
   * Une entreprise candidate ARCHIVÉE n'est jamais mutée — même règle que l'ajout d'établissement.
   */
  updateIdentity(
    patch: {
      name?: string | undefined;
      legalName?: string | null | undefined;
      tradeName?: string | null | undefined;
      siren?: string | null | undefined;
      vatNumber?: string | null | undefined;
      legalForm?: string | null | undefined;
    },
    actorId: string,
    occurredAt: Date,
  ): void {
    this.assertNotArchived();

    if (patch.name !== undefined) {
      this.props.name = patch.name;
      this.props.nameNormalized = normalizeCandidateCompanyName(patch.name);
    }
    if (patch.legalName !== undefined) {
      this.props.legalName = patch.legalName ?? undefined;
    }
    if (patch.tradeName !== undefined) {
      this.props.tradeName = patch.tradeName ?? undefined;
    }
    if (patch.siren !== undefined) {
      this.props.siren = patch.siren ?? undefined;
    }
    if (patch.vatNumber !== undefined) {
      this.props.vatNumber = patch.vatNumber ?? undefined;
    }
    if (patch.legalForm !== undefined) {
      this.props.legalForm = patch.legalForm ?? undefined;
    }

    this.props.updatedBy = actorId;
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
  get tradeName(): string | undefined {
    return this.props.tradeName;
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
