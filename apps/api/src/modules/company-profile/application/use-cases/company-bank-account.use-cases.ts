import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { CompanyBankAccountNotFoundError } from "../../domain/errors";
import type { CompanyBankAccountRecord } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { COMPANY_BANK_ACCOUNT_REPOSITORY, type CompanyBankAccountRepository, type Patch } from "../ports/company-satellite.repository";
import { CompanyProfileAccessService } from "../services/company-profile-access.service";

export type CreateCompanyBankAccountCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
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

export type UpdateCompanyBankAccountCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  bankAccountId: string;
  actorId: string;
  actorRole: string;
  patch: Patch<Omit<CreateCompanyBankAccountCommand, "organizationId" | "clientAccountId" | "actorId" | "actorRole">> & { status?: string | undefined };
}>;

/** Mission §4.4 : accès protégé par une permission BANCAIRE dédiée, distincte du profil général —
 *  jamais l'IBAN/BIC complet en clair dans le journal d'audit. */
@Injectable()
export class ListCompanyBankAccountsUseCase {
  constructor(
    @Inject(COMPANY_BANK_ACCOUNT_REPOSITORY) private readonly repository: CompanyBankAccountRepository,
    private readonly accessService: CompanyProfileAccessService,
  ) {}

  async execute(input: { organizationId: string; clientAccountId: string; actorId: string; actorRole: string }): Promise<CompanyBankAccountRecord[]> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ReadCompanyBanking });
    return this.repository.list(input);
  }
}

@Injectable()
export class CreateCompanyBankAccountUseCase {
  constructor(
    @Inject(COMPANY_BANK_ACCOUNT_REPOSITORY) private readonly repository: CompanyBankAccountRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: CreateCompanyBankAccountCommand): Promise<CompanyBankAccountRecord> {
    await this.accessService.assertClientAccess({ ...command, permission: ClientPermission.ManageCompanyBanking });
    const created = await this.repository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      clientAccountId: command.clientAccountId,
      accountHolder: command.accountHolder,
      bankName: command.bankName ?? null,
      iban: command.iban,
      bic: command.bic ?? null,
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
      action: "company_profile.bank_account_added",
      resourceType: "client_account",
      resourceId: command.clientAccountId,
      metadata: { bankAccountId: created.id, ibanLast4: created.iban.slice(-4) },
    });
    return created;
  }
}

@Injectable()
export class UpdateCompanyBankAccountUseCase {
  constructor(
    @Inject(COMPANY_BANK_ACCOUNT_REPOSITORY) private readonly repository: CompanyBankAccountRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: UpdateCompanyBankAccountCommand): Promise<CompanyBankAccountRecord> {
    await this.accessService.assertClientAccess({ ...command, permission: ClientPermission.ManageCompanyBanking });
    const updated = await this.repository.update({ organizationId: command.organizationId, clientAccountId: command.clientAccountId, id: command.bankAccountId }, command.patch);
    if (!updated) {
      throw new CompanyBankAccountNotFoundError();
    }
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "company_profile.bank_account_updated",
      resourceType: "client_account",
      resourceId: command.clientAccountId,
      metadata: { bankAccountId: updated.id, ibanLast4: updated.iban.slice(-4) },
    });
    return updated;
  }
}

/** Mission §4.4 : "ne jamais supprimer physiquement un compte bancaire". Archivage = mise à jour du
 *  statut, jamais un `delete` Prisma. */
@Injectable()
export class ArchiveCompanyBankAccountUseCase {
  constructor(
    @Inject(COMPANY_BANK_ACCOUNT_REPOSITORY) private readonly repository: CompanyBankAccountRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(input: { organizationId: string; clientAccountId: string; bankAccountId: string; actorId: string; actorRole: string }): Promise<CompanyBankAccountRecord> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ManageCompanyBanking });
    const updated = await this.repository.update({ organizationId: input.organizationId, clientAccountId: input.clientAccountId, id: input.bankAccountId }, { status: "ARCHIVED", isPrimary: false });
    if (!updated) {
      throw new CompanyBankAccountNotFoundError();
    }
    await this.auditLogWriter.record({
      organizationId: input.organizationId,
      actorType: "USER",
      actorId: input.actorId,
      action: "company_profile.bank_account_archived",
      resourceType: "client_account",
      resourceId: input.clientAccountId,
      metadata: { bankAccountId: updated.id },
    });
    return updated;
  }
}
