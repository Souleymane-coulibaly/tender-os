import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { SubmissionResponsePackageProvenanceInput, TenderSubmissionRepository } from "../application/ports/tender-submission.repository";
import type { TenderSubmission } from "../domain/tender-submission.aggregate";
import { ActiveTenderSubmissionAlreadyExistsError } from "../domain/errors";
import type { SubmissionResponsePackageProvenance } from "../domain/submission-response-package-provenance";
import { TenderSubmissionStatus } from "../domain/tender-submission-status";
import { toDomainTenderSubmission, toTenderSubmissionRow } from "./tender-submission.persistence-mapper";

const IN_FLIGHT_STATUSES: string[] = [TenderSubmissionStatus.SubmissionInProgress, TenderSubmissionStatus.Submitted, TenderSubmissionStatus.ReceiptConfirmed];

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function toProvenanceRow(organizationId: string, submissionId: string, input: SubmissionResponsePackageProvenanceInput) {
  return {
    id: randomUUID(),
    organizationId,
    submissionId,
    lotId: input.lotId,
    responsePackageVersionId: input.responsePackageVersionId,
    responsePackageArtifactId: input.responsePackageArtifactId,
    artifactChecksum: input.artifactChecksum,
  };
}

function toDomainProvenance(record: { id: string; submissionId: string; lotId: string; responsePackageVersionId: string; responsePackageArtifactId: string; artifactChecksum: string; createdAt: Date }): SubmissionResponsePackageProvenance {
  return {
    id: record.id,
    submissionId: record.submissionId,
    lotId: record.lotId,
    responsePackageVersionId: record.responsePackageVersionId,
    responsePackageArtifactId: record.responsePackageArtifactId,
    artifactChecksum: record.artifactChecksum,
    createdAt: record.createdAt,
  };
}

@Injectable()
export class PrismaTenderSubmissionRepository implements TenderSubmissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(submission: TenderSubmission, responsePackageProvenance: readonly SubmissionResponsePackageProvenanceInput[] = []): Promise<void> {
    try {
      // Checkpoint TENDEROS-2.1-P2.2-F2.3, mission §19/§20 — transaction UNIQUE dès qu'une
      // provenance multi-lot doit être écrite : jamais une Submission SUCCESS avec une provenance
      // partielle si l'écriture des lignes enfant échoue à mi-chemin.
      if (responsePackageProvenance.length === 0) {
        await this.prisma.tenderSubmission.create({ data: toTenderSubmissionRow(submission) });
        return;
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.tenderSubmission.create({ data: toTenderSubmissionRow(submission) });
        await tx.submissionResponsePackage.createMany({ data: responsePackageProvenance.map((p) => toProvenanceRow(submission.organizationId, submission.id, p)) });
      });
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

  async save(submission: TenderSubmission, responsePackageProvenance: readonly SubmissionResponsePackageProvenanceInput[] = []): Promise<void> {
    if (responsePackageProvenance.length === 0) {
      await this.prisma.tenderSubmission.update({ where: { id: submission.id }, data: toTenderSubmissionRow(submission) });
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.tenderSubmission.update({ where: { id: submission.id }, data: toTenderSubmissionRow(submission) });
      await tx.submissionResponsePackage.createMany({ data: responsePackageProvenance.map((p) => toProvenanceRow(submission.organizationId, submission.id, p)) });
    });
  }

  async replaceActive(input: { previous: TenderSubmission; next: TenderSubmission; nextResponsePackageProvenance?: readonly SubmissionResponsePackageProvenanceInput[] }): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.tenderSubmission.update({ where: { id: input.previous.id }, data: toTenderSubmissionRow(input.previous) });
        await tx.tenderSubmission.create({ data: toTenderSubmissionRow(input.next) });
        if (input.nextResponsePackageProvenance && input.nextResponsePackageProvenance.length > 0) {
          await tx.submissionResponsePackage.createMany({ data: input.nextResponsePackageProvenance.map((p) => toProvenanceRow(input.next.organizationId, input.next.id, p)) });
        }
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ActiveTenderSubmissionAlreadyExistsError();
      }
      throw error;
    }
  }

  async listResponsePackageProvenance(input: { organizationId: string; submissionId: string }): Promise<readonly SubmissionResponsePackageProvenance[]> {
    const records = await this.prisma.submissionResponsePackage.findMany({
      where: { organizationId: input.organizationId, submissionId: input.submissionId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toDomainProvenance);
  }
}
