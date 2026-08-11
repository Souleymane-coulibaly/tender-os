import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ApiKeyRepository } from "../application/ports/api-key.repository";
import type { ApiKey } from "../domain/api-key.entity";
import { toApiKeyRow, toDomainApiKey } from "./api-key.persistence-mapper";

@Injectable()
export class PrismaApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(key: ApiKey): Promise<void> {
    await this.prisma.currentClient().apiKey.create({ data: toApiKeyRow(key) });
  }

  async save(key: ApiKey): Promise<void> {
    await this.prisma.currentClient().apiKey.update({
      where: { id_organizationId: { id: key.id, organizationId: key.organizationId } },
      data: toApiKeyRow(key),
    });
  }

  async findById(input: { organizationId: string; apiKeyId: string }): Promise<ApiKey | null> {
    const row = await this.prisma.currentClient().apiKey.findFirst({ where: { id: input.apiKeyId, organizationId: input.organizationId } });
    return row ? toDomainApiKey(row) : null;
  }

  /** Mission — l'organisation n'est pas encore connue au moment de l'authentification (lookup par
   *  préfixe seul, unique globalement) : utilise volontairement `prisma` directement plutôt que
   *  `currentClient()` scopé (même motif que tout autre lookup pré-authentification dans ce
   *  dépôt, ex. `findByEmail` du module Identity). */
  async findByPrefix(keyPrefix: string): Promise<ApiKey | null> {
    const row = await this.prisma.apiKey.findUnique({ where: { keyPrefix } });
    return row ? toDomainApiKey(row) : null;
  }

  async listByOrganization(input: { organizationId: string }): Promise<readonly ApiKey[]> {
    const rows = await this.prisma.currentClient().apiKey.findMany({ where: { organizationId: input.organizationId }, orderBy: { createdAt: "desc" } });
    return rows.map(toDomainApiKey);
  }
}
