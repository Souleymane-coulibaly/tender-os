import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetExportJobUseCase } from "../../../export";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ExportNotEligibleForSignatureError, SignatoryNotFoundError } from "../../domain/errors";
import type { SignatureLevel } from "../../domain/signature-level";
import { SignatureParticipant } from "../../domain/signature-participant";
import { SignatureTransaction } from "../../domain/signature-transaction.aggregate";
import { toSignatureTransactionSummary, type SignatureTransactionSummary } from "../dtos";
import { SIGNATURE_CONFIG, type SignatureConfig } from "../ports/signature-config.port";
import { SIGNATORY_REPOSITORY, type SignatoryRepository } from "../ports/signatory.repository";
import { SIGNATURE_TRANSACTION_REPOSITORY, type SignatureTransactionRepository } from "../ports/signature-transaction.repository";

export type PrepareSignatureRequestCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  exportJobId: string;
  signatoryIds: readonly string[];
  requestedLevel?: SignatureLevel | undefined;
}>;

/**
 * Mission Sprint 8A §38/§39/§43 — prépare une transaction LOCALE (PREPARING), jamais un appel
 * prestataire ici (voir `StartSignatureTransactionUseCase`). Vérifie AVANT toute chose : export
 * FINAL et COMPLETED, signataires VERIFIED (mission "vérifié avant toute préparation"). Le
 * prestataire (`FAKE`/`UNIVERSIGN`) est TOUJOURS résolu depuis la configuration serveur — jamais
 * un choix transmis par le client (mission §37 "aucune bascule silencieuse").
 */
@Injectable()
export class PrepareSignatureRequestUseCase {
  constructor(
    @Inject(SIGNATURE_TRANSACTION_REPOSITORY) private readonly signatureTransactionRepository: SignatureTransactionRepository,
    @Inject(SIGNATORY_REPOSITORY) private readonly signatoryRepository: SignatoryRepository,
    @Inject(SIGNATURE_CONFIG) private readonly signatureConfig: SignatureConfig,
    private readonly getExportJobUseCase: GetExportJobUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: PrepareSignatureRequestCommand): Promise<SignatureTransactionSummary> {
    const exportJob = await this.getExportJobUseCase.execute({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      exportJobId: command.exportJobId,
    });

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: exportJob.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ApproveExport,
    });

    if (exportJob.mode !== "FINAL" || exportJob.status !== "COMPLETED" || !exportJob.artifact) {
      throw new ExportNotEligibleForSignatureError("the export must be FINAL and COMPLETED, with an artifact");
    }
    if (command.signatoryIds.length === 0) {
      throw new ExportNotEligibleForSignatureError("at least one signatory is required");
    }

    const occurredAt = this.clock.now();
    const signatories = [];
    for (const signatoryId of command.signatoryIds) {
      const signatory = await this.signatoryRepository.findById({ organizationId: command.organizationId, signatoryId });
      if (!signatory) {
        throw new SignatoryNotFoundError();
      }
      signatory.assertVerified(occurredAt);
      signatories.push(signatory);
    }

    const transaction = SignatureTransaction.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      clientAccountId: exportJob.clientAccountId,
      tenderId: exportJob.tenderId,
      exportArtifactId: exportJob.artifact.id,
      provider: this.signatureConfig.provider,
      requestedLevel: command.requestedLevel,
      levelSource: "MANUAL_CONFIRMATION",
      documentHash: exportJob.artifact.fileHash,
      createdBy: command.actorId,
      occurredAt,
    });

    const participants = signatories.map((signatory, index) =>
      SignatureParticipant.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        signatureTransactionId: transaction.id,
        signatoryId: signatory.id,
        sequence: index + 1,
        occurredAt,
      }),
    );

    await this.signatureTransactionRepository.create({ transaction, participants });

    return toSignatureTransactionSummary({ transaction, participants, artifacts: [] });
  }
}
