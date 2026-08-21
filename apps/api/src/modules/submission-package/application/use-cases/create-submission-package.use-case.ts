import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { EXPORT_JOB_REPOSITORY, ExportArtifactNotFoundError, type ExportJobRepository } from "../../../export";
import {
  GetResponsePackageFreshnessUseCase,
  GetSubmittableResponsePackageVersionUseCase,
  ResponsePackageFreshness,
  type SubmittableResponsePackageVersion,
  type SubmittableResponsePackageVersionForLot,
} from "../../../response-package";
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
import type { SubmissionPackageResponsePackageProvenanceInput } from "../ports/submission-package.repository";
import { toSubmissionPackageSummary, type SubmissionPackageSummary } from "../dtos";

export type CreateSubmissionPackageCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/**
 * Mission Sprint 8A bis §10/§52/§53 — "Créer un package : règle stricte" ⇒ `ApproveExport`.
 * Combine TROIS sources de vérité en LECTURE SEULE, jamais une seconde écriture : (1) Validation —
 * une `FinalApproval` ACTIVE doit exister pour ce Tender (mission "jamais de package sans
 * approbation active") ; (2) Signature — si des exigences MANDATORY ont été CONFIRMED, toutes les
 * transactions du Tender doivent être terminales et AU MOINS UNE doit être VERIFIED (mission
 * "SIGNATURE_IN_PROGRESS/PARTIALLY_SIGNED... jamais un package tant que la signature n'est pas
 * conclue"). Si aucune exigence mandatory n'est confirmée, la signature n'est simplement pas
 * requise pour ce dossier — jamais un blocage inventé. (3) Checkpoint TENDEROS-2.1-P2.2-F4.1
 * (OPTION C) — Response Package V2 : un `PackageArtifactVersion` RÉSOLU et CURRENT doit exister
 * (mêmes autorités que `submission`), sinon AUCUN package n'est créé — ce SubmissionPackage
 * n'est plus qu'un WRAPPER opérationnel/legacy du dossier V2, jamais un second moteur de
 * reconstruction du contenu métier (mission §1 "le dossier certifié par readiness doit être le
 * dossier qui alimente le dépôt"). Checkpoint TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT (fixe le P1 relevé
 * par l'audit indépendant : F4.1 refusait purement et simplement tout Tender multi-lot N≥2, une
 * régression par rapport à F2.3 qui avait déjà résolu ce cas côté `TenderSubmission`) — le mode LOT
 * (N≥1) embarque désormais CHAQUE `PackageArtifact` V2 requis comme entrée ZIP imbriquée séparée,
 * une provenance par lot (mirroir exact de `TenderSubmission.responsePackages[]`), jamais une
 * concaténation ambiguë.
 */
@Injectable()
export class CreateSubmissionPackageUseCase {
  constructor(
    @Inject(FINAL_APPROVAL_REPOSITORY) private readonly finalApprovalRepository: FinalApprovalRepository,
    @Inject(EXPORT_JOB_REPOSITORY) private readonly exportJobRepository: ExportJobRepository,
    @Inject(SIGNATURE_REQUIREMENT_REPOSITORY) private readonly signatureRequirementRepository: SignatureRequirementRepository,
    @Inject(SIGNATURE_TRANSACTION_REPOSITORY) private readonly signatureTransactionRepository: SignatureTransactionRepository,
    private readonly getSubmittableResponsePackageVersionUseCase: GetSubmittableResponsePackageVersionUseCase,
    private readonly getResponsePackageFreshnessUseCase: GetResponsePackageFreshnessUseCase,
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

    // Checkpoint TENDEROS-2.1-P2.2-F4.1 (OPTION C) — le ResponsePackage V2 devient l'AUTORITÉ du
    // contenu métier du dossier final : plus aucun SubmissionPackage ne peut être créé sans un
    // PackageArtifact V2 RÉSOLU (mission §1 "le dossier certifié par readiness doit être le dossier
    // qui alimente le dépôt") ET FRAIS (mission §16, mêmes dimensions que la Submission Readiness —
    // Candidate/DCE/Checklist/Technical Memo/Pricing/Admin). Réutilise EXACTEMENT les mêmes
    // autorités que `submission` (`GetSubmittableResponsePackageVersionUseCase`/
    // `GetResponsePackageFreshnessUseCase`), jamais un second calcul de résolution ou de fraîcheur
    // (mission §3 "ne duplique pas computeExpectedPackageItems, ne recalcule pas la freshness").
    // Checkpoint TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT — le mode LOT (N≥1, un ou plusieurs lots requis)
    // n'est JAMAIS ambigu : chaque lot requis a AU PLUS un `PackageArtifact` V2 résolu, embarqué
    // individuellement. La fraîcheur est vérifiée pour CHAQUE dossier requis (mode GLOBAL : un seul
    // appel ; mode LOT : un appel par lot, même discipline que `GetTenderSubmissionReadinessUseCase`
    // — "le PIRE signal parmi tous les dossiers requis").
    const submittableResolution = await this.getSubmittableResponsePackageVersionUseCase.execute({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: command.tenderId,
    });
    let global: SubmittableResponsePackageVersion | undefined;
    let lotEntries: readonly SubmittableResponsePackageVersionForLot[] = [];
    if (submittableResolution.status === "RESOLVED") {
      global = submittableResolution;
    } else if (submittableResolution.status === "RESOLVED_MULTI_LOT") {
      lotEntries = submittableResolution.entries;
    } else {
      throw new PackageNotReadyError("no submittable Response Package V2 dossier is resolved for this tender yet — build, validate and generate it first");
    }
    for (const responsePackageId of global ? [global.responsePackageId] : lotEntries.map((e) => e.responsePackageId)) {
      const responsePackageFreshness = await this.getResponsePackageFreshnessUseCase.execute({
        organizationId: command.organizationId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        responsePackageId,
      });
      if (responsePackageFreshness.freshness !== ResponsePackageFreshness.Current) {
        throw new PackageNotReadyError("the Response Package V2 dossier is not CURRENT — rebuild and revalidate it before creating a submission package");
      }
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
      // Checkpoint TENDEROS-2.1-P2.2-F5 (audit) — une `SignatureTransaction` porte TOUJOURS sur un
      // `ExportArtifact` FINAL figé (`exportArtifactId`, jamais sur le dossier V2). Un cycle
      // Réouverture -> nouvelle FinalApproval -> nouvel export FINAL (`ReopenFinalVersionUseCase` ne
      // touche jamais aux transactions existantes) laisse d'anciennes transactions VERIFIED liées à
      // un export DÉSORMAIS obsolète. Sans ce filtre, `verified` les inclurait quand même (elles
      // restent VERIFIED) alors que CE package embarque un `exportFound.artifact` différent — une
      // signature pourrait alors accompagner silencieusement un dossier matériellement différent de
      // celui qu'elle a authentifié. Jamais un dépôt qui mélange la preuve de signature d'un export
      // avec le contenu d'un autre (mission §1 "fail closed").
      const currentExportArtifactId = exportFound.artifact.id;
      const verified = transactions.filter((t) => t.transaction.status === SignatureTransactionStatus.Verified && t.transaction.exportArtifactId === currentExportArtifactId);
      const nonTerminal = transactions.filter(
        (t) => !isTerminalSignatureTransactionStatus(t.transaction.status as SignatureTransactionStatus) && t.transaction.exportArtifactId === currentExportArtifactId,
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

    // Checkpoint TENDEROS-2.1-P2.2-F4.1 (OPTION C) — le PackageArtifact V2 lui-même est embarqué tel
    // quel comme source de contenu métier : il porte déjà les pièces administratives (F3/F3.1), le
    // mémoire technique (fix F4) et le chiffrage (E1) candidate-scoped — jamais reconstruits une
    // seconde fois indépendamment ici (mission §5 "ne plus reconstruire ce qui est déjà encapsulé
    // dans le PackageArtifact V2 validé" ; §16 "pas de second pipeline SubmissionPackage
    // indépendant pour Technical Memo/Pricing"). Remplace l'ancien bloc `ADMINISTRATIVE_DOCUMENT`
    // (Sprint 8C Phase 2), devenu une duplication pure de ce que ce fichier contient déjà.
    // Checkpoint TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT — mode LOT : CHAQUE `PackageArtifact` V2 requis
    // est embarqué comme entrée ZIP imbriquée séparée, namespacée par lot (jamais une collision
    // possible même si deux lots partagent le même nom de fichier d'artefact).
    let responsePackageProvenance: readonly SubmissionPackageResponsePackageProvenanceInput[] = [];
    if (global) {
      sources.push({
        archivePath: `dossier-reponse-v2/${global.artifactFileName}`,
        sourceType: "RESPONSE_PACKAGE_ARTIFACT",
        sourceId: global.responsePackageVersionId,
        fileName: global.artifactFileName,
        mimeType: global.artifactMimeType,
        fileSize: global.artifactSizeBytes,
        fileHash: global.artifactChecksum,
        sourceStorageKey: global.artifactStorageKey,
        order: sources.length,
      });
    } else {
      let order = sources.length;
      for (const entry of lotEntries) {
        sources.push({
          archivePath: `dossier-reponse-v2/${entry.lotId}/${entry.artifactFileName}`,
          sourceType: "RESPONSE_PACKAGE_ARTIFACT",
          sourceId: entry.responsePackageVersionId,
          fileName: entry.artifactFileName,
          mimeType: entry.artifactMimeType,
          fileSize: entry.artifactSizeBytes,
          fileHash: entry.artifactChecksum,
          sourceStorageKey: entry.artifactStorageKey,
          order: order++,
        });
      }
      responsePackageProvenance = lotEntries.map((entry) => ({
        lotId: entry.lotId,
        responsePackageVersionId: entry.responsePackageVersionId,
        responsePackageArtifactId: entry.artifactId,
        artifactChecksum: entry.artifactChecksum,
      }));
    }

    const readinessStatus = mandatoryConfirmed.length > 0 ? "READY_FOR_SUBMISSION" : "APPROVED";

    const { pkg, files, responsePackageProvenance: persistedProvenance } = await this.packageAssemblyService.run({
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      tenderId: command.tenderId,
      validationRunId: approval.validationRunId,
      approvalId: approval.id,
      readinessStatus,
      sources,
      // Checkpoint TENDEROS-2.1-P2.2-F4.1 — provenance V2 figée sur la ligne créée, jamais
      // réévaluée après coup (mission §7 "la provenance doit être figée"). Mode GLOBAL uniquement —
      // le mode LOT utilise exclusivement `responsePackageProvenance` ci-dessous, jamais les deux à
      // la fois (mission implicite du fix Codex "réutiliser le SOT existant", mirroir de
      // `TenderSubmission`).
      responsePackageVersionId: global?.responsePackageVersionId,
      responsePackageArtifactId: global?.artifactId,
      responsePackageArtifactChecksum: global?.artifactChecksum,
      responsePackageProvenance,
      createdBy: command.actorId,
      occurredAt: this.clock.now(),
    });

    return toSubmissionPackageSummary({ pkg, files, responsePackageProvenance: persistedProvenance });
  }
}
