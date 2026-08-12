import { Injectable } from "@nestjs/common";
import type { ExternalConnection as ExternalConnectionRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { ConnectionStatus, type ConnectorProvider } from "../domain/enums";
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
}
