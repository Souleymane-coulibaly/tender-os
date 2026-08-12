import { Injectable } from "@nestjs/common";
import type { OAuthFlowState as OAuthFlowStateRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ConnectorProvider } from "../domain/enums";
import { OAuthFlowState } from "../domain/oauth-flow-state.entity";
import type { OAuthFlowStateRepository } from "../application/ports/oauth-flow-state.repository";

function toDomain(record: OAuthFlowStateRecord): OAuthFlowState {
  return OAuthFlowState.rehydrate({
    id: record.id,
    state: record.state,
    organizationId: record.organizationId,
    userId: record.userId,
    provider: record.provider as ConnectorProvider,
    connectionId: record.connectionId ?? undefined,
    codeVerifier: record.codeVerifier,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    consumedAt: record.consumedAt ?? undefined,
  });
}

@Injectable()
export class PrismaOAuthFlowStateRepository implements OAuthFlowStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(state: OAuthFlowState): Promise<void> {
    const data = {
      id: state.id,
      state: state.state,
      organizationId: state.organizationId,
      userId: state.userId,
      provider: state.provider,
      connectionId: state.connectionId ?? null,
      codeVerifier: state.codeVerifier,
      expiresAt: state.expiresAt,
      consumedAt: state.consumedAt ?? null,
    };
    await this.prisma.currentClient().oAuthFlowState.upsert({ where: { id: data.id }, create: data, update: data });
  }

  async findByState(value: string): Promise<OAuthFlowState | null> {
    const record = await this.prisma.currentClient().oAuthFlowState.findUnique({ where: { state: value } });
    return record ? toDomain(record) : null;
  }

  async consumeIfValid(value: string, now: Date): Promise<OAuthFlowState | null> {
    const result = await this.prisma.currentClient().oAuthFlowState.updateMany({
      where: { state: value, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (result.count === 0) {
      return null;
    }
    const record = await this.prisma.currentClient().oAuthFlowState.findUnique({ where: { state: value } });
    return record ? toDomain(record) : null;
  }
}
