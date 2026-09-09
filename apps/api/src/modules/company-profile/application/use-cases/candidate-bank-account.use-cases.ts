import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { CandidatePermission } from "../../../candidate-company/domain/candidate-permission";
import { ibanLast4, isValidBic, isValidIban, normalizeBic, normalizeIban } from "../../domain/bank-identifiers";
import { CompanyBankAccountNotFoundError, InvalidBicError, InvalidIbanError } from "../../domain/errors";
import type { CompanyBankAccountRecord } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { COMPANY_BANK_ACCOUNT_REPOSITORY, type CompanyBankAccountRepository } from "../ports/company-satellite.repository";
import { CandidateCapabilityAccessService } from "../services/candidate-capability-access.service";

/**
 * Checkpoint TENDEROS-2.1-CCV2-C.1 — coordonnées bancaires de l'entreprise candidate.
 *
 * SOT V2 : `CandidateCompany`. Aucune table nouvelle — la structure posée par CCV2-B
 * (`company_bank_accounts.candidate_company_id`) suffit, et le backfill l'a déjà remplie. Aucune
 * copie, aucun dual-write : une seule ligne physique, adressée par `candidateCompanyId`.
 *
 * PERMISSIONS : `candidate:read_banking` / `candidate:manage_banking` (CCV2-A, inchangées).
 * `candidate:read` NE DONNE PAS accès au banking — c'est tout l'objet de la séparation : un
 * CONTRIBUTOR peut lire la fiche candidate et éditer ses capacités, jamais voir un IBAN.
 *
 * AUCUN FALLBACK : si le candidat n'a aucun compte, la réponse est une liste vide. Jamais le
 * banking du `ClientAccount`, même lorsque `sourceClientAccountId` est connu.
 *
 * IBAN/BIC : validés (ISO 13616 / ISO 9362) et NORMALISÉS avant écriture. Le journal d'audit ne
 * reçoit que `ibanLast4`, jamais l'IBAN complet — convention déjà établie côté Legacy.
 *
 * SUPPRESSION : archivage (`status = ARCHIVED`, `isPrimary = false`), jamais de suppression
 * physique — règle explicite du schéma : « jamais de suppression physique si utilisé dans un
 * document/package existant ».
 */

export type ListCandidateBankAccountsQuery = Readonly<{
  organizationId: string;
  candidateCompanyId: string;
  actorRole: string;
}>;

export type CreateCandidateBankAccountCommand = Readonly<{
  organizationId: string;
  candidateCompanyId: string;
  actorId: string;
  actorRole: string;
  accountHolder: string;
  bankName?: string | undefined;
  iban: string;
  bic?: string | undefined;
  country?: string | undefined;
  currency?: string | undefined;
  documentId?: string | undefined;
  isPrimary?: boolean | undefined;
}>;

export type UpdateCandidateBankAccountCommand = Readonly<{
  organizationId: string;
  candidateCompanyId: string;
  bankAccountId: string;
  actorId: string;
  actorRole: string;
  patch: Readonly<{
    accountHolder?: string | undefined;
    bankName?: string | undefined;
    iban?: string | undefined;
    bic?: string | undefined;
    country?: string | undefined;
    currency?: string | undefined;
    documentId?: string | undefined;
    isPrimary?: boolean | undefined;
    status?: string | undefined;
  }>;
}>;

export type ArchiveCandidateBankAccountCommand = Readonly<{
  organizationId: string;
  candidateCompanyId: string;
  bankAccountId: string;
  actorId: string;
  actorRole: string;
}>;

/** Validation + normalisation communes. Lève une erreur métier typée (422), jamais une erreur
 *  générique qui laisserait passer un identifiant faux jusqu'en base. */
function normalizeIdentifiers(input: { iban?: string | undefined; bic?: string | undefined }): { iban?: string; bic?: string } {
  const result: { iban?: string; bic?: string } = {};
  if (input.iban !== undefined) {
    if (!isValidIban(input.iban)) {
      throw new InvalidIbanError();
    }
    result.iban = normalizeIban(input.iban);
  }
  if (input.bic !== undefined) {
    if (!isValidBic(input.bic)) {
      throw new InvalidBicError();
    }
    result.bic = normalizeBic(input.bic);
  }
  return result;
}

@Injectable()
export class ListCandidateBankAccountsUseCase {
  constructor(
    @Inject(COMPANY_BANK_ACCOUNT_REPOSITORY) private readonly repository: CompanyBankAccountRepository,
    private readonly accessService: CandidateCapabilityAccessService,
  ) {}

  async execute(query: ListCandidateBankAccountsQuery): Promise<CompanyBankAccountRecord[]> {
    await this.accessService.assertCandidateAccess({ ...query, permission: CandidatePermission.ReadBanking });
    return this.repository.listByCandidate({ organizationId: query.organizationId, candidateCompanyId: query.candidateCompanyId });
  }
}

@Injectable()
export class CreateCandidateBankAccountUseCase {
  constructor(
    @Inject(COMPANY_BANK_ACCOUNT_REPOSITORY) private readonly repository: CompanyBankAccountRepository,
    private readonly accessService: CandidateCapabilityAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: CreateCandidateBankAccountCommand): Promise<CompanyBankAccountRecord> {
    await this.accessService.assertCandidateAccess({ ...command, permission: CandidatePermission.ManageBanking });
    const identifiers = normalizeIdentifiers({ iban: command.iban, bic: command.bic });

    const created = await this.repository.createForCandidate({
      id: randomUUID(),
      organizationId: command.organizationId,
      // Le compte NAÎT candidate-owned : aucun propriétaire Legacy, y compris pour une
      // CandidateCompany native. `organizationId`/`candidateCompanyId` viennent EXCLUSIVEMENT du
      // contexte authentifié et du chemin d'URL vérifié — jamais du corps de la requête.
      clientAccountId: null,
      candidateCompanyId: command.candidateCompanyId,
      accountHolder: command.accountHolder,
      bankName: command.bankName ?? null,
      iban: identifiers.iban as string,
      bic: identifiers.bic ?? null,
      country: command.country ?? null,
      currency: command.currency ?? null,
      documentId: command.documentId ?? null,
      isPrimary: command.isPrimary ?? false,
      validatedAt: null,
      validatedByUserId: null,
      status: "ACTIVE",
      createdBy: command.actorId,
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "candidate_company.bank_account_added",
      resourceType: "candidate_company",
      resourceId: command.candidateCompanyId,
      // JAMAIS l'IBAN complet, jamais le BIC : seuls les 4 derniers caractères, comme le fait déjà
      // `company_profile.bank_account_added`.
      metadata: { bankAccountId: created.id, ibanLast4: ibanLast4(created.iban) },
    });
    return created;
  }
}

@Injectable()
export class UpdateCandidateBankAccountUseCase {
  constructor(
    @Inject(COMPANY_BANK_ACCOUNT_REPOSITORY) private readonly repository: CompanyBankAccountRepository,
    private readonly accessService: CandidateCapabilityAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: UpdateCandidateBankAccountCommand): Promise<CompanyBankAccountRecord> {
    await this.accessService.assertCandidateAccess({ ...command, permission: CandidatePermission.ManageBanking });
    const identifiers = normalizeIdentifiers({ iban: command.patch.iban, bic: command.patch.bic });

    const scope = { organizationId: command.organizationId, candidateCompanyId: command.candidateCompanyId, id: command.bankAccountId };
    const updated = await this.repository.updateForCandidate(scope, { ...command.patch, ...identifiers });
    if (!updated) {
      // N'existe pas SOUS CE CANDIDAT — y compris s'il existe sous un autre candidat de la même
      // organisation, ou dans un autre tenant : 404, jamais 403.
      throw new CompanyBankAccountNotFoundError();
    }

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "candidate_company.bank_account_updated",
      resourceType: "candidate_company",
      resourceId: command.candidateCompanyId,
      metadata: { bankAccountId: updated.id, ibanLast4: ibanLast4(updated.iban) },
    });
    return updated;
  }
}

@Injectable()
export class ArchiveCandidateBankAccountUseCase {
  constructor(
    @Inject(COMPANY_BANK_ACCOUNT_REPOSITORY) private readonly repository: CompanyBankAccountRepository,
    private readonly accessService: CandidateCapabilityAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: ArchiveCandidateBankAccountCommand): Promise<CompanyBankAccountRecord> {
    await this.accessService.assertCandidateAccess({ ...command, permission: CandidatePermission.ManageBanking });
    const archived = await this.repository.updateForCandidate(
      { organizationId: command.organizationId, candidateCompanyId: command.candidateCompanyId, id: command.bankAccountId },
      // Même effet que l'archivage Legacy : un compte archivé cesse d'être le compte principal.
      { status: "ARCHIVED", isPrimary: false },
    );
    if (!archived) {
      throw new CompanyBankAccountNotFoundError();
    }

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "candidate_company.bank_account_archived",
      resourceType: "candidate_company",
      resourceId: command.candidateCompanyId,
      // Ni IBAN ni empreinte : l'archivage ne nécessite aucune donnée bancaire pour être auditable.
      metadata: { bankAccountId: archived.id },
    });
    return archived;
  }
}
