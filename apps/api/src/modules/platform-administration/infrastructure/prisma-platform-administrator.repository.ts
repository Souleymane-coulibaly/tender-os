import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { PlatformAdministratorRepository } from "../application/ports/platform-administrator.repository";
import type { PlatformAdministrator } from "../domain/platform-administrator.aggregate";
import { PlatformAdministratorPersistenceMapper } from "./platform-administrator.persistence-mapper";

@Injectable()
export class PrismaPlatformAdministratorRepository implements PlatformAdministratorRepository {
  private readonly mapper = new PlatformAdministratorPersistenceMapper();

  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<PlatformAdministrator | null> {
    const record = await this.prisma.platformAdministrator.findUnique({ where: { userId } });

    return record ? this.mapper.toDomain(record) : null;
  }

  async countByRole(): Promise<Record<string, number>> {
    const rows = await this.prisma.platformAdministrator.groupBy({
      by: ["role"],
      _count: { _all: true },
    });

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.role] = row._count._all;
    }

    return counts;
  }

  async save(administrator: PlatformAdministrator): Promise<void> {
    const data = this.mapper.toPersistence(administrator);

    await this.prisma.platformAdministrator.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }
}
