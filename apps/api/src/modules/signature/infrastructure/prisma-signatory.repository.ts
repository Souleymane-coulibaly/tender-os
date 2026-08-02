import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { Signatory } from "../domain/signatory";
import type { SignatoryRepository } from "../application/ports/signatory.repository";
import { toDomainSignatory } from "./signature.persistence-mapper";

@Injectable()
export class PrismaSignatoryRepository implements SignatoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(signatory: Signatory): Promise<void> {
    await this.prisma.signatory.create({ data: toRow(signatory) });
  }

  async findById(input: { organizationId: string; signatoryId: string }): Promise<Signatory | null> {
    const record = await this.prisma.signatory.findFirst({ where: { id: input.signatoryId, organizationId: input.organizationId } });
    return record ? toDomainSignatory(record) : null;
  }

  async listForTender(input: { organizationId: string; tenderId: string }): Promise<readonly Signatory[]> {
    const records = await this.prisma.signatory.findMany({ where: { organizationId: input.organizationId, tenderId: input.tenderId }, orderBy: { createdAt: "asc" } });
    return records.map(toDomainSignatory);
  }

  async save(signatory: Signatory): Promise<void> {
    await this.prisma.signatory.update({ where: { id: signatory.id }, data: toRow(signatory) });
  }
}

function toRow(s: Signatory) {
  return {
    id: s.id,
    organizationId: s.organizationId,
    clientAccountId: s.clientAccountId,
    tenderId: s.tenderId,
    userId: s.userId ?? null,
    firstName: s.firstName,
    lastName: s.lastName,
    professionalEmail: s.professionalEmail,
    jobTitle: s.jobTitle ?? null,
    organizationName: s.organizationName ?? null,
    authorityText: s.authorityText ?? null,
    authorityDocumentId: s.authorityDocumentId ?? null,
    validFrom: s.validFrom ?? null,
    validUntil: s.validUntil ?? null,
    status: s.status,
    verifiedBy: s.verifiedBy ?? null,
    verifiedAt: s.verifiedAt ?? null,
    createdBy: s.createdBy,
    createdAt: s.createdAt,
  };
}
