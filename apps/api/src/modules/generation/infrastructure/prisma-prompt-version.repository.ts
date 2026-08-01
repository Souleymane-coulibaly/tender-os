import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { PromptVersionRepository } from "../application/ports/prompt-version.repository";
import { PromptVersionActivationConflictError } from "../domain/errors";
import { PromptVersionStatus } from "../domain/prompt-version-status";
import type { PromptVersion } from "../domain/prompt-version.entity";
import { toDomain, toPersistence } from "./prompt-version.persistence-mapper";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaPromptVersionRepository implements PromptVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; versionId: string }): Promise<PromptVersion | null> {
    const record = await this.prisma.promptVersion.findFirst({ where: { id: input.versionId, organizationId: input.organizationId } });
    return record ? toDomain(record) : null;
  }

  async findActive(input: { organizationId: string; promptTemplateId: string }): Promise<PromptVersion | null> {
    const record = await this.prisma.promptVersion.findFirst({
      where: { organizationId: input.organizationId, promptTemplateId: input.promptTemplateId, status: PromptVersionStatus.Active },
    });
    return record ? toDomain(record) : null;
  }

  async listByTemplate(input: { organizationId: string; promptTemplateId: string }): Promise<readonly PromptVersion[]> {
    const records = await this.prisma.promptVersion.findMany({
      where: { organizationId: input.organizationId, promptTemplateId: input.promptTemplateId },
      orderBy: { version: "desc" },
    });
    return records.map(toDomain);
  }

  async nextVersionNumber(input: { organizationId: string; promptTemplateId: string }): Promise<number> {
    const latest = await this.prisma.promptVersion.findFirst({
      where: { organizationId: input.organizationId, promptTemplateId: input.promptTemplateId },
      orderBy: { version: "desc" },
    });
    return (latest?.version ?? 0) + 1;
  }

  async create(version: PromptVersion): Promise<void> {
    await this.prisma.promptVersion.create({ data: toPersistence(version) });
  }

  async save(version: PromptVersion): Promise<void> {
    const data = toPersistence(version);
    await this.prisma.promptVersion.update({ where: { id: data.id }, data });
  }

  /** Même motif que `PrismaRoutingPolicyRepository.activateAtomically` (Sprint 5.2) — transaction
   *  courte : archive l'éventuelle version ACTIVE précédente puis active celle-ci. L'index unique
   *  partiel `prompt_versions_org_template_active_key` (migration) reste le filet de sécurité de
   *  dernier recours si cette invariante était violée par une course de concurrence. */
  async activateAtomically(version: PromptVersion): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const currentActive = await tx.promptVersion.findFirst({
          where: {
            organizationId: version.organizationId,
            promptTemplateId: version.promptTemplateId,
            status: PromptVersionStatus.Active,
            id: { not: version.id },
          },
        });
        if (currentActive) {
          await tx.promptVersion.update({
            where: { id: currentActive.id },
            data: { status: PromptVersionStatus.Archived, archivedAt: version.effectiveFrom ?? new Date() },
          });
        }
        await tx.promptVersion.update({ where: { id: version.id }, data: toPersistence(version) });
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new PromptVersionActivationConflictError();
      }
      throw error;
    }
  }
}
