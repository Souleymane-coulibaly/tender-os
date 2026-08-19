import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ResponsePackageVersionRepository } from "../application/ports/response-package-version.repository";
import type { ResponsePackageVersion } from "../domain/response-package-version.entity";
import { toDomainResponsePackageVersion, toResponsePackageVersionRow } from "./response-package-version.persistence-mapper";

@Injectable()
export class PrismaResponsePackageVersionRepository implements ResponsePackageVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async lockPackage(input: { organizationId: string; responsePackageId: string }): Promise<void> {
    await this.prisma.currentClient().$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.organizationId}:${input.responsePackageId}`}))`;
  }

  async create(version: ResponsePackageVersion): Promise<void> {
    await this.prisma.currentClient().responsePackageVersion.create({ data: toResponsePackageVersionRow(version) });
  }

  async save(version: ResponsePackageVersion): Promise<void> {
    await this.prisma.currentClient().responsePackageVersion.update({
      where: { id_organizationId: { id: version.id, organizationId: version.organizationId } },
      data: toResponsePackageVersionRow(version),
    });
  }

  async findById(input: { organizationId: string; responsePackageVersionId: string }): Promise<ResponsePackageVersion | null> {
    const record = await this.prisma.currentClient().responsePackageVersion.findFirst({
      where: { id: input.responsePackageVersionId, organizationId: input.organizationId },
    });
    return record ? toDomainResponsePackageVersion(record) : null;
  }

  async list(input: { organizationId: string; responsePackageId: string }): Promise<readonly ResponsePackageVersion[]> {
    const records = await this.prisma.currentClient().responsePackageVersion.findMany({
      where: { organizationId: input.organizationId, responsePackageId: input.responsePackageId },
      orderBy: { versionNumber: "desc" },
    });
    return records.map(toDomainResponsePackageVersion);
  }
}
