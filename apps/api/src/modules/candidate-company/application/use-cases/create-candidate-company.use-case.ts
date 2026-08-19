import { Inject, Injectable } from "@nestjs/common";
// Import DIRECT du fichier source (jamais le barrel `company-profile/index.ts`) — correctif d'une
// dépendance circulaire réelle trouvée par exécution (Checkpoint 2.1-A4) : le barrel réexporte
// aussi `CompanyProfileModule`, qui importe `DocumentsModule`, qui importe `TendersModule`, qui
// importe `candidate-company` (depuis A3) — un cycle require() complet. `isValidSiren` est une
// fonction PURE sans aucune dépendance (voir le fichier source), jamais besoin du module NestJS
// pour l'utiliser ; l'importer via le barrel n'apportait donc aucune valeur, seulement ce cycle.
import { isValidSiren } from "../../../company-profile/domain/french-company-identifiers";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { CandidateCompany } from "../../domain/candidate-company.aggregate";
import { normalizeCandidateCompanyName } from "../../domain/candidate-name-normalizer";
import { DuplicateCandidateCompanyNameError, InvalidSirenError } from "../../domain/errors";
import { toCandidateCompanySummary, type CandidateCompanySummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CANDIDATE_COMPANY_REPOSITORY, type CandidateCompanyRepository } from "../ports/candidate-company.repository";

export type CreateCandidateCompanyCommand = Readonly<{
  organizationId: string;
  actorId: string;
  name: string;
  legalName?: string | undefined;
  siren?: string | undefined;
  vatNumber?: string | undefined;
  legalForm?: string | undefined;
  /** MIGRATION_COMPATIBILITY_FIELD (mission §12) — jamais renseigné par le flux de création normal
   *  en A1 (aucune UI ne l'expose) ; réservé au backfill A2. */
  sourceClientAccountId?: string | undefined;
  requestId?: string | undefined;
}>;

/**
 * Création d'une entreprise candidate (mission TenderOS 2.1-A1 §"CANDIDATE COMPANY") — autorisation
 * organization-isolation-only (mission §20) : tout membre authentifié de l'organisation peut créer,
 * aucune matrice de permission dédiée en A1 (`CandidatePermission` explicitement différé). Le SIREN
 * est validé via la validation Luhn déjà existante (`company-profile`), jamais réimplémentée.
 */
@Injectable()
export class CreateCandidateCompanyUseCase {
  constructor(
    @Inject(CANDIDATE_COMPANY_REPOSITORY) private readonly candidateCompanyRepository: CandidateCompanyRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateCandidateCompanyCommand): Promise<CandidateCompanySummary> {
    if (command.siren !== undefined && !isValidSiren(command.siren)) {
      throw new InvalidSirenError();
    }

    const nameNormalized = normalizeCandidateCompanyName(command.name);
    const existing = await this.candidateCompanyRepository.findByNormalizedName({ organizationId: command.organizationId, nameNormalized });
    if (existing) {
      throw new DuplicateCandidateCompanyNameError();
    }

    const occurredAt = this.clock.now();
    const company = CandidateCompany.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      name: command.name,
      legalName: command.legalName,
      siren: command.siren,
      vatNumber: command.vatNumber,
      legalForm: command.legalForm,
      sourceClientAccountId: command.sourceClientAccountId,
      createdBy: command.actorId,
      occurredAt,
    });

    await this.candidateCompanyRepository.create(company);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "candidate_company.created",
      resourceType: "candidate_company",
      resourceId: company.id,
      requestId: command.requestId,
    });

    return toCandidateCompanySummary(company);
  }
}
