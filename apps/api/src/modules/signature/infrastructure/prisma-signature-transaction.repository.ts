import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { SignatureArtifact } from "../domain/signature-artifact";
import type { SignatureParticipant } from "../domain/signature-participant";
import type { SignatureTransaction } from "../domain/signature-transaction.aggregate";
import type { SignatureTransactionRepository, SignatureTransactionWithDetails } from "../application/ports/signature-transaction.repository";
import { toDomainArtifact, toDomainParticipant, toDomainTransaction } from "./signature.persistence-mapper";

const INCLUDE = { participants: { orderBy: { sequence: "asc" as const } }, artifacts: { orderBy: { createdAt: "asc" as const } } };

@Injectable()
export class PrismaSignatureTransactionRepository implements SignatureTransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: { transaction: SignatureTransaction; participants: readonly SignatureParticipant[] }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.signatureTransaction.create({ data: toTransactionRow(input.transaction) }),
      ...(input.participants.length > 0
        ? [
            this.prisma.signatureParticipant.createMany({
              data: input.participants.map((p) => ({
                id: p.id,
                organizationId: p.organizationId,
                signatureTransactionId: input.transaction.id,
                signatoryId: p.signatoryId,
                providerParticipantId: p.providerParticipantId ?? null,
                sequence: p.sequence,
                status: p.status,
                invitationRedirectUrl: p.invitationRedirectUrl ?? null,
                createdAt: p.createdAt,
              })),
            }),
          ]
        : []),
    ]);
  }

  private toDetails(record: Parameters<typeof toDomainTransaction>[0] & { participants: Parameters<typeof toDomainParticipant>[0][]; artifacts: Parameters<typeof toDomainArtifact>[0][] }): SignatureTransactionWithDetails {
    return {
      transaction: toDomainTransaction(record),
      participants: record.participants.map(toDomainParticipant),
      artifacts: record.artifacts.map(toDomainArtifact),
    };
  }

  async findById(input: { organizationId: string; transactionId: string }): Promise<SignatureTransactionWithDetails | null> {
    const record = await this.prisma.signatureTransaction.findFirst({ where: { id: input.transactionId, organizationId: input.organizationId }, include: INCLUDE });
    return record ? this.toDetails(record) : null;
  }

  async findByProviderTransactionId(input: { provider: string; providerTransactionId: string }): Promise<SignatureTransactionWithDetails | null> {
    const record = await this.prisma.signatureTransaction.findFirst({ where: { provider: input.provider, providerTransactionId: input.providerTransactionId }, include: INCLUDE });
    return record ? this.toDetails(record) : null;
  }

  async listForTender(input: { organizationId: string; tenderId: string }): Promise<readonly SignatureTransactionWithDetails[]> {
    const records = await this.prisma.signatureTransaction.findMany({ where: { organizationId: input.organizationId, tenderId: input.tenderId }, include: INCLUDE, orderBy: { createdAt: "desc" } });
    return records.map((r) => this.toDetails(r));
  }

  async save(transaction: SignatureTransaction): Promise<void> {
    await this.prisma.signatureTransaction.update({ where: { id: transaction.id }, data: toTransactionRow(transaction) });
  }

  async saveParticipant(participant: SignatureParticipant): Promise<void> {
    await this.prisma.signatureParticipant.update({
      where: { id: participant.id },
      data: { status: participant.status, providerParticipantId: participant.providerParticipantId ?? null },
    });
  }

  async addArtifact(artifact: SignatureArtifact): Promise<void> {
    await this.prisma.signatureArtifact.create({ data: toArtifactRow(artifact) });
  }

  async saveArtifact(artifact: SignatureArtifact): Promise<void> {
    await this.prisma.signatureArtifact.update({
      where: { id: artifact.id },
      data: { verificationStatus: artifact.verificationStatus ?? null, verifiedBy: artifact.verifiedBy ?? null, verifiedAt: artifact.verifiedAt ?? null },
    });
  }
}

function toTransactionRow(t: SignatureTransaction) {
  return {
    id: t.id,
    organizationId: t.organizationId,
    clientAccountId: t.clientAccountId,
    tenderId: t.tenderId,
    exportArtifactId: t.exportArtifactId,
    provider: t.provider,
    providerTransactionId: t.providerTransactionId ?? null,
    status: t.status,
    requestedLevel: t.requestedLevel ?? null,
    confirmedLevel: t.confirmedLevel ?? null,
    levelSource: t.levelSource ?? null,
    documentHash: t.documentHash,
    createdBy: t.createdBy,
    createdAt: t.createdAt,
    startedAt: t.startedAt ?? null,
    completedAt: t.completedAt ?? null,
    errorCode: t.errorCode ?? null,
    errorMessage: t.errorMessage ?? null,
  };
}

function toArtifactRow(a: SignatureArtifact) {
  return {
    id: a.id,
    organizationId: a.organizationId,
    signatureTransactionId: a.signatureTransactionId,
    kind: a.kind,
    fileName: a.fileName,
    mimeType: a.mimeType,
    fileSize: a.fileSize,
    fileHash: a.fileHash,
    storageKey: a.storageKey,
    providerArtifactId: a.providerArtifactId ?? null,
    isFakeTestEvidence: a.isFakeTestEvidence,
    source: a.source,
    importedBy: a.importedBy ?? null,
    verificationStatus: a.verificationStatus ?? null,
    verifiedBy: a.verifiedBy ?? null,
    verifiedAt: a.verifiedAt ?? null,
    createdAt: a.createdAt,
  };
}
