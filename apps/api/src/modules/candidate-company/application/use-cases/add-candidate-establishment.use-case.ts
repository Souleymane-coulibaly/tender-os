import { Inject, Injectable } from "@nestjs/common";
// Import DIRECT du fichier source, jamais le barrel — même correctif de cycle require() que
// `create-candidate-company.use-case.ts` (voir son commentaire pour le détail complet).
import { isValidSiret } from "../../../company-profile/domain/french-company-identifiers";
import { assertHasCandidatePermission, CandidatePermission } from "../../domain/candidate-permission";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { CandidateEstablishment } from "../../domain/candidate-establishment.entity";
import {
  CandidateCompanyNotFoundError,
  DuplicateCandidateEstablishmentSiretError,
  DuplicatePrincipalCandidateEstablishmentError,
  InvalidSiretError,
} from "../../domain/errors";
import { toCandidateEstablishmentSummary, type CandidateEstablishmentSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CANDIDATE_COMPANY_REPOSITORY, type CandidateCompanyRepository } from "../ports/candidate-company.repository";

export type AddCandidateEstablishmentCommand = Readonly<{
  organizationId: string;
  actorId: string;
  /** Rôle d'ORGANISATION de l'acteur (`MembershipContext.role`), jamais un rôle client. */
  actorRole: string;
  candidateCompanyId: string;
  siret: string;
  label?: string | undefined;
  isPrincipal?: boolean | undefined;
  addressLine?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  requestId?: string | undefined;
}>;

/**
 * Ajout d'un établissement (SIRET) à une entreprise candidate (mission TenderOS 2.1-A1
 * §"CANDIDATE ESTABLISHMENT"). Le SIRET est validé via la validation Luhn déjà existante
 * (`company-profile`), jamais réimplémentée. L'unicité du SIRET (organisation) et l'unicité de
 * l'établissement principal (par entreprise candidate) sont vérifiées ici en amont (erreur métier
 * claire) ET protégées en base par un index unique / un index unique partiel (migration) — même
 * discipline "vérification applicative + contrainte base en filet de sécurité" que
 * `CreateClientAccountUseCase`.
 */
@Injectable()
export class AddCandidateEstablishmentUseCase {
  constructor(
    @Inject(CANDIDATE_COMPANY_REPOSITORY) private readonly candidateCompanyRepository: CandidateCompanyRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: AddCandidateEstablishmentCommand): Promise<CandidateEstablishmentSummary> {
    assertHasCandidatePermission(command.actorRole, CandidatePermission.ManageIdentity);
    if (!isValidSiret(command.siret)) {
      throw new InvalidSiretError();
    }

    const company = await this.candidateCompanyRepository.findById({
      organizationId: command.organizationId,
      candidateCompanyId: command.candidateCompanyId,
    });
    if (!company) {
      throw new CandidateCompanyNotFoundError();
    }
    company.assertCanAddEstablishment();

    const existingBySiret = await this.candidateCompanyRepository.findEstablishmentBySiret({
      organizationId: command.organizationId,
      siret: command.siret,
    });
    if (existingBySiret) {
      throw new DuplicateCandidateEstablishmentSiretError();
    }

    if (command.isPrincipal) {
      const siblings = await this.candidateCompanyRepository.listEstablishmentsByCompany({
        organizationId: command.organizationId,
        candidateCompanyId: command.candidateCompanyId,
      });
      if (siblings.some((establishment) => establishment.isPrincipal)) {
        throw new DuplicatePrincipalCandidateEstablishmentError();
      }
    }

    const occurredAt = this.clock.now();
    const establishment = CandidateEstablishment.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      candidateCompanyId: command.candidateCompanyId,
      siret: command.siret,
      label: command.label,
      isPrincipal: command.isPrincipal,
      addressLine: command.addressLine,
      postalCode: command.postalCode,
      city: command.city,
      country: command.country,
      createdBy: command.actorId,
      occurredAt,
    });

    await this.candidateCompanyRepository.createEstablishment(establishment);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "candidate_establishment.created",
      resourceType: "candidate_establishment",
      resourceId: establishment.id,
      requestId: command.requestId,
    });

    return toCandidateEstablishmentSummary(establishment);
  }
}
