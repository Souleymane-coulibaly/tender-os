import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { ClientAccount } from "../../domain/client-account.aggregate";
import type { ClientAccountStatus } from "../../domain/client-account-status";
import { ClientPermission } from "../../domain/client-permission";
import { DuplicateClientAccountNameError } from "../../domain/errors";
import { normalizeClientAccountName } from "../../domain/client-name-normalizer";
import { toClientAccountSummary, type ClientAccountSummary } from "../dtos";
import { assertHasClientPortfolioPermission } from "../policies/client-portfolio-authorization.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CLIENT_ACCOUNT_REPOSITORY, type ClientAccountRepository } from "../ports/client-account.repository";

export type CreateClientAccountCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  name: string;
  legalName?: string | undefined;
  reference?: string | undefined;
  sector?: string | undefined;
  country?: string | undefined;
  address?: string | undefined;
  website?: string | undefined;
  notes?: string | undefined;
  status?: typeof ClientAccountStatus.Active | typeof ClientAccountStatus.Inactive | undefined;
  requestId?: string | undefined;
}>;

/** Création d'un client (mission §"Créer un client") — réservée à OWNER/ORGANIZATION_ADMIN
 *  (palier organisation, `ROLE_CLIENT_PORTFOLIO_PERMISSIONS`). Refuse tout doublon de nom au sein
 *  d'une même organisation à la casse/espaces près (mission §"pas de client en doublon"). */
@Injectable()
export class CreateClientAccountUseCase {
  constructor(
    @Inject(CLIENT_ACCOUNT_REPOSITORY) private readonly clientAccountRepository: ClientAccountRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateClientAccountCommand): Promise<ClientAccountSummary> {
    assertHasClientPortfolioPermission(command.actorRole, ClientPermission.Create);

    const nameNormalized = normalizeClientAccountName(command.name);
    const existing = await this.clientAccountRepository.findByNormalizedName({ organizationId: command.organizationId, nameNormalized });
    if (existing) {
      throw new DuplicateClientAccountNameError();
    }

    const occurredAt = this.clock.now();
    const client = ClientAccount.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      name: command.name,
      legalName: command.legalName,
      reference: command.reference,
      sector: command.sector,
      country: command.country,
      address: command.address,
      website: command.website,
      notes: command.notes,
      status: command.status,
      createdBy: command.actorId,
      occurredAt,
    });

    await this.clientAccountRepository.create(client);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "client_account.created",
      resourceType: "client_account",
      resourceId: client.id,
      requestId: command.requestId,
    });

    return toClientAccountSummary(client);
  }
}
