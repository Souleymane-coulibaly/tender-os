import { Injectable } from "@nestjs/common";
import { ListSubmissionPackagesUseCase, PackageFileSourceType, PackageStatus } from "../../../submission-package";
import { SubmissionPackageMissingError, SubmissionPackageOutdatedError } from "../../domain/errors";

export type ResolvedSubmissionPackage = Readonly<{ packageId: string; packageVersion: number; packageHash: string; manifestHash: string }>;

/**
 * Sprint 9 — mission §29 : le package référencé doit être la DERNIÈRE version `COMPLETED` du
 * Tender au moment de l'enregistrement (interprétation retenue en l'absence d'un flag
 * d'obsolescence dans `submission-package`, voir le plan approuvé). Centralisé ici pour que
 * `StartTenderSubmissionUseCase`/`RecordTenderSubmissionUseCase`/`ReplaceTenderSubmissionUseCase`
 * appliquent tous EXACTEMENT la même règle (mission §5 "ne duplique jamais du code").
 */
@Injectable()
export class SubmissionPackageResolverService {
  constructor(private readonly listSubmissionPackagesUseCase: ListSubmissionPackagesUseCase) {}

  async resolveExactPackage(input: { organizationId: string; actorId: string; actorRole: string; tenderId: string; packageId: string }): Promise<ResolvedSubmissionPackage> {
    const packages = await this.listSubmissionPackagesUseCase.execute({ organizationId: input.organizationId, actorId: input.actorId, actorRole: input.actorRole, tenderId: input.tenderId });

    const target = packages.find((p) => p.id === input.packageId);
    if (!target || target.status !== PackageStatus.Completed || !target.fileHash) {
      throw new SubmissionPackageMissingError();
    }

    const latestCompleted = packages.filter((p) => p.status === PackageStatus.Completed).sort((a, b) => b.version - a.version)[0];
    if (!latestCompleted || latestCompleted.id !== target.id) {
      throw new SubmissionPackageOutdatedError();
    }

    // Correctif audit Codex P1 — le manifeste EXACT du package doit être prouvable, jamais laissé
    // optionnel/non alimenté : dérivé du fichier `manifest.json` réellement inclus dans le package
    // (`PackageFileSourceType.Manifest`), jamais recalculé ni approximé par `packageHash` (qui
    // couvre le ZIP entier, pas le manifeste seul).
    const manifestFile = target.files.find((f) => f.sourceType === PackageFileSourceType.Manifest);
    if (!manifestFile) {
      throw new SubmissionPackageMissingError();
    }

    return { packageId: target.id, packageVersion: target.version, packageHash: target.fileHash, manifestHash: manifestFile.fileHash };
  }
}
