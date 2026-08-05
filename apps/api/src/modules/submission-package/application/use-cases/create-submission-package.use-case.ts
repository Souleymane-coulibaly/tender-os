import { Inject, Injectable } from "@nestjs/common";
import { ListValidatedAdministrativeDocumentsForPackageUseCase } from "../../../administrative-dossier";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { DOCUMENT_VERSION_REPOSITORY, type DocumentVersionRepository } from "../../../documents";
import { EXPORT_JOB_REPOSITORY, ExportArtifactNotFoundError, type ExportJobRepository } from "../../../export";
import {
  isTerminalSignatureTransactionStatus,
  SIGNATURE_REQUIREMENT_REPOSITORY,
  SIGNATURE_TRANSACTION_REPOSITORY,
  SignatureTransactionStatus,
  type SignatureRequirementRepository,
  type SignatureTransactionRepository,
} from "../../../signature";
import { FINAL_APPROVAL_REPOSITORY, type FinalApprovalRepository } from "../../../validation";
import { GetTenderUseCase } from "../../../tenders";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { PackageNotReadyError } from "../../domain/errors";
import { PackageAssemblyService, type PackageSourceFile } from "../services/package-assembly.service";
import { toSubmissionPackageSummary, type SubmissionPackageSummary } from "../dtos";

export type CreateSubmissionPackageCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

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
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly documentVersionRepository: DocumentVersionRepository,
    private readonly listValidatedAdministrativeDocumentsForPackageUseCase: ListValidatedAdministrativeDocumentsForPackageUseCase,
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
      const verified = transactions.filter((t) => t.transaction.status === SignatureTransactionStatus.Verified);
      const nonTerminal = transactions.filter(
        (t) => !isTerminalSignatureTransactionStatus(t.transaction.status as SignatureTransactionStatus),
      );
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

    // Sprint 8C Phase 2 — mission "intégration package" : les pièces administratives VALIDÉES
    // (DC1/DC2/DC4/DUME/AE/attestations/pouvoirs...) sont incluses comme des sources de plus,
    // jamais un blocage supplémentaire — un dossier administratif absent/incomplet ne bloque pas la
    // création du package (le blocage métier reste porté par Validation/Signature ci-dessus).
    const administrativeDocuments = await this.listValidatedAdministrativeDocumentsForPackageUseCase.execute({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: command.tenderId,
    });
    let administrativeOrder = sources.length;
    for (const administrativeDocument of administrativeDocuments) {
      const version = await this.documentVersionRepository.findById({
        organizationId: command.organizationId,
        documentId: administrativeDocument.documentId,
        versionId: administrativeDocument.documentVersionId,
      });
      if (!version) continue; // référence dénormalisée obsolète — jamais bloquant pour le package.
      sources.push({
        // Préfixé par l'id de la pièce — plusieurs pièces peuvent porter le même nom de fichier
        // (ex. deux "attestation.pdf" distinctes), jamais une collision de chemin dans le ZIP.
        archivePath: `administratif/${administrativeDocument.administrativeDocumentId}-${administrativeDocument.documentFileName}`,
        sourceType: "ADMINISTRATIVE_DOCUMENT",
        sourceId: administrativeDocument.administrativeDocumentId,
        fileName: administrativeDocument.documentFileName,
        mimeType: administrativeDocument.documentMimeType,
        fileSize: version.sizeBytes,
        fileHash: administrativeDocument.documentChecksum,
        sourceStorageKey: version.storageKey,
        order: administrativeOrder++,
      });
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
