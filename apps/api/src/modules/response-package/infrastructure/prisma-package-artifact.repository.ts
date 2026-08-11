import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { PackageArtifactRepository } from "../application/ports/package-artifact.repository";
import type { PackageArtifact } from "../domain/package-artifact.value-object";
import { toDomainPackageArtifact, toPackageArtifactRow } from "./package-artifact.persistence-mapper";

@Injectable()
export class PrismaPackageArtifactRepository implements PackageArtifactRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(artifact: PackageArtifact): Promise<void> {
    await this.prisma.currentClient().packageArtifact.create({ data: toPackageArtifactRow(artifact) });
  }

  async listByVersion(input: { organizationId: string; responsePackageVersionId: string }): Promise<readonly PackageArtifact[]> {
    const records = await this.prisma.currentClient().packageArtifact.findMany({
      where: { organizationId: input.organizationId, responsePackageVersionId: input.responsePackageVersionId },
      orderBy: { generatedAt: "desc" },
    });
    return records.map(toDomainPackageArtifact);
  }
}
