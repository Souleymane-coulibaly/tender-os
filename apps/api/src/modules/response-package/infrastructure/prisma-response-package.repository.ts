import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ResponsePackageRepository } from "../application/ports/response-package.repository";
import type { ResponsePackage } from "../domain/response-package.aggregate";
import { toDomainResponsePackage, toResponsePackageRow } from "./response-package.persistence-mapper";

@Injectable()
export class PrismaResponsePackageRepository implements ResponsePackageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(pkg: ResponsePackage): Promise<void> {
    await this.prisma.currentClient().responsePackage.create({ data: toResponsePackageRow(pkg) });
  }

  async save(pkg: ResponsePackage): Promise<void> {
    await this.prisma.currentClient().responsePackage.update({
      where: { id_organizationId: { id: pkg.id, organizationId: pkg.organizationId } },
      data: toResponsePackageRow(pkg),
    });
  }

  async findById(input: { organizationId: string; responsePackageId: string }): Promise<ResponsePackage | null> {
    const record = await this.prisma.currentClient().responsePackage.findFirst({ where: { id: input.responsePackageId, organizationId: input.organizationId } });
    return record ? toDomainResponsePackage(record) : null;
  }

  async findByScope(input: { organizationId: string; tenderId: string; lotId: string | null; clientAccountId: string }): Promise<ResponsePackage | null> {
    const record = await this.prisma.currentClient().responsePackage.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId, lotId: input.lotId, clientAccountId: input.clientAccountId },
    });
    return record ? toDomainResponsePackage(record) : null;
  }

  async list(input: { organizationId: string; tenderId: string; lotId?: string | undefined; clientAccountId?: string | undefined }): Promise<readonly ResponsePackage[]> {
    const records = await this.prisma.currentClient().responsePackage.findMany({
      where: {
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        ...(input.lotId !== undefined ? { lotId: input.lotId } : {}),
        ...(input.clientAccountId !== undefined ? { clientAccountId: input.clientAccountId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return records.map(toDomainResponsePackage);
  }
}
