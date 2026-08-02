import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { EXPORT_JOB_REPOSITORY, ExportArtifactNotFoundError, type ExportJobRepository } from "../../../export";
import { SIGNATURE_REQUIREMENT_REPOSITORY, SIGNATURE_TRANSACTION_REPOSITORY, type SignatureRequirementRepository, type SignatureTransactionRepository } from "../../../signature";
import { FINAL_APPROVAL_REPOSITORY, type FinalApprovalRepository } from "../../../validation";
import { GetTenderUseCase } from "../../../tenders";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { PackageNotReadyError } from "../../domain/errors";
import { PackageAssemblyService, type PackageSourceFile } from "../services/package-assembly.service";
import { toSubmissionPackageSummary, type SubmissionPackageSummary } from "../dtos";

export type CreateSubmissionPackageCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

const TERMINAL_TRANSACTION_STATUSES = new Set(["VERIFIED", "DECLINED", "CANCELLED", "EXPIRED", "FAILED", "INVALID"]);

/**
 * Mission Sprint 8A bis §10/§52/§53 — "Créer un package : règle stricte" ⇒ `ApproveExport`.
 * Combine DEUX sources de vérité en LECTURE SEULE, jamais une seconde écriture : (1) Validation —
 * une `FinalApproval` ACTIVE doit exister pour ce Tender (mission "jamais de package sans
 * approbation active") ; (2) Signature — si des exigences MANDATORY ont été CONFIRMED, toutes les
 * transactions du Tender doivent être terminales et AU MOINS UNE doit être VERIFIED (mission
 * "SIGNATURE_IN_PROGRESS/PARTIALLY_SIGNED... jamais un package tant que la signature n'est pas
 * conclue"). Si aucune exigence mandatory n'est confirmée, la signature n'est simplement pas
 * requise pour ce dossier — jamais un blocage inventé.
 */
@Injectable()
export class CreateSubmissionPackageUseCase {
  constructor(
    @Inject(FINAL_APPROVAL_REPOSITORY) private readonly finalApprovalRepository: FinalApprovalRepository,
    @Inject(EXPORT_JOB_REPOSITORY) private readonly exportJobRepository: ExportJobRepository,
    @Inject(SIGNATURE_REQUIREMENT_REPOSITORY) private readonly signatureRequirementRepository: SignatureRequirementRepository,
    @Inject(SIGNATURE_TRANSACTION_REPOSITORY) private readonly signatureTransactionRepository: SignatureTransactionRepository,
    private readonly packageAssemblyService: PackageAssemblyService,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CreateSubmissionPackageCommand): Promise<SubmissionPackageSummary> {
    const tender = await this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole });
    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ApproveExport,
    });

    const approval = await this.finalApprovalRepository.findActiveForTender({ organizationId: command.organizationId, tenderId: command.tenderId });
    if (!approval || !approval.isActive) {
      throw new PackageNotReadyError("no active final approval for this tender — approve the final export first");
    }

    const exportFound = await this.exportJobRepository.findById({ organizationId: command.organizationId, exportJobId: approval.exportJobId });
    if (!exportFound || !exportFound.artifact) {
      throw new ExportArtifactNotFoundError();
    }
    if (exportFound.artifact.fileHash !== approval.manifestHash) {
      // Défense en profondeur (mission "toute substitution silencieuse... est P1") — ne devrait
      // jamais se produire puisqu'un export FINAL/COMPLETED est immuable, mais jamais supposé.
      throw new PackageNotReadyError("the approved export's artifact no longer matches the approved manifest hash");
    }

    const requirements = await this.signatureRequirementRepository.listForTender({ organizationId: command.organizationId, tenderId: command.tenderId });
    const mandatoryConfirmed = requirements.filter((r) => r.mandatory && r.status === "CONFIRMED");

    const sources: PackageSourceFile[] = [
      {
        archivePath: exportFound.artifact.fileName,
        sourceType: "EXPORT_ARTIFACT",
        sourceId: exportFound.artifact.id,
        fileName: exportFound.artifact.fileName,
        mimeType: exportFound.artifact.mimeType,
        fileSize: exportFound.artifact.fileSize,
        fileHash: exportFound.artifact.fileHash,
        sourceStorageKey: exportFound.artifact.storageKey,
        order: 0,
      },
    ];

    if (mandatoryConfirmed.length > 0) {
      const transactions = await this.signatureTransactionRepository.listForTender({ organizationId: command.organizationId, tenderId: command.tenderId });
      const verified = transactions.filter((t) => t.transaction.status === "VERIFIED");
      const nonTerminal = transactions.filter((t) => !TERMINAL_TRANSACTION_STATUSES.has(t.transaction.status));
      if (verified.length === 0 || nonTerminal.length > 0) {
        throw new PackageNotReadyError("mandatory signatures are not fully verified yet — the tender is not ready for packaging");
      }

      let order = 1;
      for (const { artifacts } of verified) {
        for (const artifact of artifacts) {
          const folder = artifact.kind === "SIGNED_DOCUMENT" ? "signatures" : "preuves";
          sources.push({
            archivePath: `${folder}/${artifact.fileName}`,
            sourceType: "SIGNATURE_ARTIFACT",
            sourceId: artifact.id,
            fileName: artifact.fileName,
            mimeType: artifact.mimeType,
            fileSize: artifact.fileSize,
            fileHash: artifact.fileHash,
            sourceStorageKey: artifact.storageKey,
            order: order++,
          });
        }
      }
    }

    const readinessStatus = mandatoryConfirmed.length > 0 ? "READY_FOR_SUBMISSION" : "APPROVED";

    const { pkg, files } = await this.packageAssemblyService.run({
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      tenderId: command.tenderId,
      validationRunId: approval.validationRunId,
      approvalId: approval.id,
      readinessStatus,
      sources,
      createdBy: command.actorId,
      occurredAt: this.clock.now(),
    });

    return toSubmissionPackageSummary({ pkg, files });
  }
}
