import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { SubmissionProofRepository } from "../application/ports/submission-proof.repository";
import type { SubmissionProof } from "../domain/submission-proof.entity";
import { toDomainSubmissionProof, toSubmissionProofRow } from "./submission-proof.persistence-mapper";

@Injectable()
export class PrismaSubmissionProofRepository implements SubmissionProofRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(proof: SubmissionProof): Promise<void> {
    await this.prisma.submissionProof.create({ data: toSubmissionProofRow(proof) });
  }

  async findById(input: { organizationId: string; proofId: string }): Promise<SubmissionProof | null> {
    const record = await this.prisma.submissionProof.findFirst({ where: { id: input.proofId, organizationId: input.organizationId } });
    return record ? toDomainSubmissionProof(record) : null;
  }

  async listBySubmission(input: { organizationId: string; submissionId: string }): Promise<readonly SubmissionProof[]> {
    const records = await this.prisma.submissionProof.findMany({
      where: { organizationId: input.organizationId, submissionId: input.submissionId },
      orderBy: { uploadedAt: "asc" },
    });
    return records.map(toDomainSubmissionProof);
  }
}
