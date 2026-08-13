import { Injectable } from "@nestjs/common";
import type { ExternalConnection as ExternalConnectionRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { ConnectionStatus, type ConnectorProvider } from "../domain/enums";
import { ExternalConnectionNotFoundError } from "../domain/errors";
import { ExternalConnection } from "../domain/external-connection.entity";
import type { ExternalConnectionRepository } from "../application/ports/external-connection.repository";

function toDomain(record: ExternalConnectionRecord): ExternalConnection {
  return ExternalConnection.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    provider: record.provider as ConnectorProvider,
    name: record.name,
    status: record.status as ConnectionStatus,
    scopes: record.scopes,
    externalAccountId: record.externalAccountId,
    externalTenantId: record.externalTenantId ?? undefined,
    externalAccountLabel: record.externalAccountLabel ?? undefined,
    encryptedAccessToken: record.encryptedAccessToken ?? undefined,
    encryptedRefreshToken: record.encryptedRefreshToken ?? undefined,
    expiresAt: record.expiresAt ?? undefined,
    lastRefreshAt: record.lastRefreshAt ?? undefined,
    lastSuccessfulSyncAt: record.lastSuccessfulSyncAt ?? undefined,
    lastError: record.lastError ?? undefined,
    allowedClientAccountIds: record.allowedClientAccountIds,
    createdBy: record.createdBy,
    connectedBy: record.connectedBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    revokedAt: record.revokedAt ?? undefined,
    revokedBy: record.revokedBy ?? undefined,
  });
}

function toPersistence(connection: ExternalConnection) {
  return {
    id: connection.id,
    organizationId: connection.organizationId,
    provider: connection.provider,
    name: connection.name,
    status: connection.status,
    scopes: [...connection.scopes],
    externalAccountId: connection.externalAccountId,
    externalTenantId: connection.externalTenantId ?? null,
    externalAccountLabel: connection.externalAccountLabel ?? null,
    encryptedAccessToken: connection.encryptedAccessToken ?? null,
    encryptedRefreshToken: connection.encryptedRefreshToken ?? null,
    expiresAt: connection.expiresAt ?? null,
    lastRefreshAt: connection.lastRefreshAt ?? null,
    lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt ?? null,
    lastError: connection.lastError ?? null,
    allowedClientAccountIds: [...connection.allowedClientAccountIds],
    createdBy: connection.createdBy,
    connectedBy: connection.connectedBy,
    revokedAt: connection.revokedAt ?? null,
    revokedBy: connection.revokedBy ?? null,
  };
}

@Injectable()
export class PrismaExternalConnectionRepository implements ExternalConnectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; connectionId: string }): Promise<ExternalConnection | null> {
    const record = await this.prisma.currentClient().externalConnection.findFirst({ where: { id: input.connectionId, organizationId: input.organizationId } });
    return record ? toDomain(record) : null;
  }

  async findActiveByOrganizationAndProvider(input: { organizationId: string; provider: ConnectorProvider }): Promise<ExternalConnection | null> {
    const record = await this.prisma.currentClient().externalConnection.findFirst({
      where: { organizationId: input.organizationId, provider: input.provider, status: { in: [ConnectionStatus.Pending, ConnectionStatus.Active, ConnectionStatus.ReauthRequired] } },
    });
    return record ? toDomain(record) : null;
  }

  async listByOrganization(input: { organizationId: string }): Promise<readonly ExternalConnection[]> {
    const records = await this.prisma.currentClient().externalConnection.findMany({ where: { organizationId: input.organizationId }, orderBy: { createdAt: "desc" } });
    return records.map(toDomain);
  }

  async save(connection: ExternalConnection): Promise<void> {
    const data = toPersistence(connection);
    await this.prisma.currentClient().externalConnection.upsert({ where: { id: data.id }, create: data, update: data });
  }

  /** Mission §11/§95 — verrou consultatif Postgres transactionnel scopé à `connectionId`, même
   *  motif que `analysis`/`chat`/`dce`/`document-generation`/`extraction`
   *  (`pg_advisory_xact_lock(hashtext(...))`). La connexion est RELUE à l'intérieur du verrou (pas
   *  la référence passée par l'appelant) afin qu'un appelant qui attendait le verrou voie l'état
   *  déjà rafraîchi par un appelant concurrent, jamais une image obsolète.
   *
   *  IMPORTANT : `fn` ne doit JAMAIS laisser son exception s'échapper du callback passé à
   *  `prisma.$transaction()` — Prisma annule (rollback) toute la transaction dès que ce callback
   *  lève, ce qui effacerait silencieusement la mutation qu'on vient pourtant de persister (ex.
   *  passage en REAUTH_REQUIRED après un échec de refresh). L'erreur métier de `fn` est donc
   *  capturée, la mutation persistée et committée normalement, puis l'erreur seulement RE-levée une
   *  fois la transaction terminée. */
  async withLock<T>(input: { organizationId: string; connectionId: string }, fn: (connection: ExternalConnection) => Promise<T>): Promise<T> {
    let outcome: { ok: true; value: T } | { ok: false; error: unknown } | undefined;

    await this.prisma.withTransaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.connectionId}))`;
      const record = await tx.externalConnection.findFirst({ where: { id: input.connectionId, organizationId: input.organizationId } });
      if (!record) throw new ExternalConnectionNotFoundError();
      const connection = toDomain(record);
      try {
        outcome = { ok: true, value: await fn(connection) };
      } catch (error) {
        outcome = { ok: false, error };
      }
      const data = toPersistence(connection);
      await tx.externalConnection.update({ where: { id: data.id }, data });
    });

    if (outcome === undefined || !outcome.ok) {
      throw outcome === undefined ? new ExternalConnectionNotFoundError() : outcome.error;
    }
    return outcome.value;
  }
}
