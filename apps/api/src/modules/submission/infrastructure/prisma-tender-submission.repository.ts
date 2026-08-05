import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { TenderSubmissionRepository } from "../application/ports/tender-submission.repository";
import type { TenderSubmission } from "../domain/tender-submission.aggregate";
import { ActiveTenderSubmissionAlreadyExistsError } from "../domain/errors";
import { TenderSubmissionStatus } from "../domain/tender-submission-status";
import { toDomainTenderSubmission, toTenderSubmissionRow } from "./tender-submission.persistence-mapper";

const IN_FLIGHT_STATUSES: string[] = [TenderSubmissionStatus.SubmissionInProgress, TenderSubmissionStatus.Submitted, TenderSubmissionStatus.ReceiptConfirmed];

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaTenderSubmissionRepository implements TenderSubmissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(submission: TenderSubmission): Promise<void> {
    try {
      await this.prisma.tenderSubmission.create({ data: toTenderSubmissionRow(submission) });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ActiveTenderSubmissionAlreadyExistsError();
      }
      throw error;
    }
  }

  async findById(input: { organizationId: string; submissionId: string }): Promise<TenderSubmission | null> {
    const record = await this.prisma.tenderSubmission.findFirst({ where: { id: input.submissionId, organizationId: input.organizationId } });
    return record ? toDomainTenderSubmission(record) : null;
  }

  async findActiveForTender(input: { organizationId: string; tenderId: string }): Promise<TenderSubmission | null> {
    const record = await this.prisma.tenderSubmission.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId, status: { in: IN_FLIGHT_STATUSES } },
    });
    return record ? toDomainTenderSubmission(record) : null;
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<readonly TenderSubmission[]> {
    const records = await this.prisma.tenderSubmission.findMany({
      where: { organizationId: input.organizationId, tenderId: input.tenderId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toDomainTenderSubmission);
  }

  async save(submission: TenderSubmission): Promise<void> {
    await this.prisma.tenderSubmission.update({ where: { id: submission.id }, data: toTenderSubmissionRow(submission) });
  }

  async replaceActive(input: { previous: TenderSubmission; next: TenderSubmission }): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.tenderSubmission.update({ where: { id: input.previous.id }, data: toTenderSubmissionRow(input.previous) });
        await tx.tenderSubmission.create({ data: toTenderSubmissionRow(input.next) });
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ActiveTenderSubmissionAlreadyExistsError();
      }
      throw error;
    }
  }
}
