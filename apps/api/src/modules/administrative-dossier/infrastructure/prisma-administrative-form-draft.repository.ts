import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AdministrativeFormDraftRepository } from "../application/ports/administrative-form-draft.repository";
import type { AdministrativeFormDraft } from "../domain/administrative-form-draft.aggregate";
import { toAdministrativeFormDraftRow, toDomainAdministrativeFormDraft } from "./administrative-form-draft.persistence-mapper";

@Injectable()
export class PrismaAdministrativeFormDraftRepository implements AdministrativeFormDraftRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(draft: AdministrativeFormDraft): Promise<void> {
    await this.prisma.administrativeFormDraft.create({ data: toAdministrativeFormDraftRow(draft) });
  }

  async find(input: { organizationId: string; tenderId: string; documentType: string; scopeId: string }): Promise<AdministrativeFormDraft | null> {
    const record = await this.prisma.administrativeFormDraft.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId, documentType: input.documentType, scopeId: input.scopeId },
    });
    return record ? toDomainAdministrativeFormDraft(record) : null;
  }

  async save(draft: AdministrativeFormDraft): Promise<void> {
    await this.prisma.administrativeFormDraft.update({ where: { id: draft.id }, data: toAdministrativeFormDraftRow(draft) });
  }
}
