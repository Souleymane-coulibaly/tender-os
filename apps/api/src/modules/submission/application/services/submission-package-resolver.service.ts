import { Injectable } from "@nestjs/common";
import { GetResponsePackageFreshnessUseCase, GetSubmittableResponsePackageVersionUseCase, ResponsePackageFreshness } from "../../../response-package";
import { ListSubmissionPackagesUseCase, PackageFileSourceType, PackageStatus } from "../../../submission-package";
import { SubmissionPackageMissingError, SubmissionPackageOutdatedError } from "../../domain/errors";

export type ResolvedSubmissionPackage = Readonly<{ packageId: string; packageVersion: number; packageHash: string; manifestHash: string }>;

/**
 * Sprint 9 — mission §29 : le package référencé doit être la DERNIÈRE version `COMPLETED` du
 * Tender au moment de l'enregistrement (interprétation retenue en l'absence d'un flag
 * d'obsolescence dans `submission-package`, voir le plan approuvé). Centralisé ici pour que
 * `StartTenderSubmissionUseCase`/`RecordTenderSubmissionUseCase`/`ReplaceTenderSubmissionUseCase`
 * appliquent tous EXACTEMENT la même règle (mission §5 "ne duplique jamais du code").
 *
 * Checkpoint TENDEROS-2.1-P2.2-F4.1 (OPTION C, mission §11) — "dernier COMPLETED" ne suffit plus :
 * un `SubmissionPackage` legacy COMPLETED peut désormais être PROUVÉ obsolète si sa provenance V2
 * stampée (`responsePackageVersionId`/`responsePackageArtifactId`, figée à sa création) ne
 * correspond plus au dossier V2 SUBMITTABLE COURANT — réutilise EXACTEMENT la même autorité que
 * `CreateSubmissionPackageUseCase` (`GetSubmittableResponsePackageVersionUseCase`), jamais un
 * second calcul de résolution (mission §3). Un package antérieur à ce checkpoint
 * (`responsePackageVersionId=NULL`, jamais backfillé, mission §12) ne peut structurellement plus
 * jamais satisfaire ce contrôle — ce n'est jamais une réécriture de son historique, seulement la
 * fin de sa capacité à être choisi pour un NOUVEAU dépôt (mission §1 "fail closed").
 */
@Injectable()
export class SubmissionPackageResolverService {
  constructor(
    private readonly listSubmissionPackagesUseCase: ListSubmissionPackagesUseCase,
    private readonly getSubmittableResponsePackageVersionUseCase: GetSubmittableResponsePackageVersionUseCase,
    private readonly getResponsePackageFreshnessUseCase: GetResponsePackageFreshnessUseCase,
  ) {}

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

    // Checkpoint TENDEROS-2.1-P2.2-F4.1 — le wrapper choisi doit être PROUVÉ aligné avec le dossier
    // V2 submittable COURANT, relu FRAIS à cet instant précis (jamais une valeur mise en cache),
    // exactement comme la Submission Readiness le fait pour ses propres dimensions (mission §9/§10
    // "au moment exact du dépôt... le système doit fail closed"). Checkpoint
    // TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT — mode LOT (N≥1) : l'alignement se prouve lot par lot
    // contre `target.responsePackages` (provenance figée à la création du wrapper, mirroir exact de
    // `TenderSubmission.responsePackages[]`), jamais via les 3 champs scalaires réservés au mode
    // GLOBAL.
    const submittableResolution = await this.getSubmittableResponsePackageVersionUseCase.execute({
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      tenderId: input.tenderId,
    });
    const responsePackageIdsToCheckFreshness: string[] = [];
    if (submittableResolution.status === "RESOLVED") {
      if (submittableResolution.responsePackageVersionId !== target.responsePackageVersionId || submittableResolution.artifactId !== target.responsePackageArtifactId) {
        throw new SubmissionPackageOutdatedError();
      }
      responsePackageIdsToCheckFreshness.push(submittableResolution.responsePackageId);
    } else if (submittableResolution.status === "RESOLVED_MULTI_LOT") {
      if (submittableResolution.entries.length !== target.responsePackages.length) {
        throw new SubmissionPackageOutdatedError();
      }
      for (const entry of submittableResolution.entries) {
        const row = target.responsePackages.find((p) => p.lotId === entry.lotId);
        if (!row || row.responsePackageVersionId !== entry.responsePackageVersionId || row.responsePackageArtifactId !== entry.artifactId) {
          throw new SubmissionPackageOutdatedError();
        }
        responsePackageIdsToCheckFreshness.push(entry.responsePackageId);
      }
    } else {
      throw new SubmissionPackageOutdatedError();
    }
    // `GetSubmittableResponsePackageVersionUseCase` ne vérifie QUE la résolvabilité structurelle
    // (mission §3, jamais un second calcul de fraîcheur) — un candidat/pièce/mémoire/chiffrage
    // changé APRÈS la construction du dossier V2 (mais AVANT tout rebuild) résout toujours au MÊME
    // `responsePackageVersionId`/`artifactId`, structurellement identique mais STALE en contenu.
    // Seule `GetResponsePackageFreshnessUseCase` (même moteur que la Submission Readiness/
    // response-package, jamais dupliqué ici) le détecte — vérification complémentaire, obligatoire,
    // pour CHAQUE dossier requis (mode LOT : un par lot, jamais seulement le premier).
    for (const responsePackageId of responsePackageIdsToCheckFreshness) {
      const freshness = await this.getResponsePackageFreshnessUseCase.execute({
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        responsePackageId,
      });
      if (freshness.freshness !== ResponsePackageFreshness.Current) {
        throw new SubmissionPackageOutdatedError();
      }
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
