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
    // Checkpoint TENDEROS-2.1-CCV2-I.1 — l'ARCHIVAGE reste ouvert, a la difference de la creation
    // et de la mise a jour, retirees juste au-dessus. Exclusion deliberee, pas un oubli :
    //
    // l'invariant vise est `NEW_BIDDER_DUAL_WRITE_SURFACE_COUNT = 0`, c'est-a-dire qu'aucune donnee
    // de candidature ne NAISSE plus ni ne CHANGE DE VALEUR sur la surface Client — sans quoi celle-ci
    // redeviendrait une source de verite concurrente de `CandidateCompany`. Archiver ne cree aucune
    // donnee et n'altere aucune valeur de candidature : cela ne fait que retirer de l'usage actif une
    // ligne historique. C'est donc un mouvement DANS le sens du decommissionnement, pas contre lui.
    //
    // Le refuser aurait un cout net : les lignes Legacy deviendraient definitivement inneutralisables
    // depuis leur seule surface de gestion, et la regression P0 « archiver une ressource d'un autre
    // client via sa propre route » (corrigee lors de l'audit Codex) perdrait sa preuve executable.

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
