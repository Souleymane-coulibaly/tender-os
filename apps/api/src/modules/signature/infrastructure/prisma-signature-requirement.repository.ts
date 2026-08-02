import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { SignatureRequirement } from "../domain/signature-requirement";
import type { SignatureRequirementRepository } from "../application/ports/signature-requirement.repository";
import { toDomainRequirement } from "./signature.persistence-mapper";

@Injectable()
export class PrismaSignatureRequirementRepository implements SignatureRequirementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(requirement: SignatureRequirement): Promise<void> {
    await this.prisma.signatureRequirement.create({ data: toRow(requirement) });
  }

  async findById(input: { organizationId: string; requirementId: string }): Promise<SignatureRequirement | null> {
    const record = await this.prisma.signatureRequirement.findFirst({ where: { id: input.requirementId, organizationId: input.organizationId } });
    return record ? toDomainRequirement(record) : null;
  }

  async listForTender(input: { organizationId: string; tenderId: string }): Promise<readonly SignatureRequirement[]> {
    const records = await this.prisma.signatureRequirement.findMany({ where: { organizationId: input.organizationId, tenderId: input.tenderId }, orderBy: { createdAt: "asc" } });
    return records.map(toDomainRequirement);
  }

  async save(requirement: SignatureRequirement): Promise<void> {
    await this.prisma.signatureRequirement.update({ where: { id: requirement.id }, data: toRow(requirement) });
  }
}

function toRow(r: SignatureRequirement) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    clientAccountId: r.clientAccountId,
    tenderId: r.tenderId,
    documentRef: r.documentRef,
    sourceDce: r.sourceDce ?? null,
    pageOrSection: r.pageOrSection ?? null,
    mandatory: r.mandatory,
    momentText: r.momentText ?? null,
    format: r.format ?? null,
    levelExpected: r.levelExpected ?? null,
    certificateRequirement: r.certificateRequirement ?? null,
    signatoryExpected: r.signatoryExpected ?? null,
    confidence: r.confidence,
    status: r.status,
    confirmedBy: r.confirmedBy ?? null,
    confirmedAt: r.confirmedAt ?? null,
    comment: r.comment ?? null,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  };
}
