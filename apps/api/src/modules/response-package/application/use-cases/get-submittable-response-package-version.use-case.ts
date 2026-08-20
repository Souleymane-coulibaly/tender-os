import { Inject, Injectable } from "@nestjs/common";
import { PACKAGE_ARTIFACT_REPOSITORY, type PackageArtifactRepository } from "../ports/package-artifact.repository";
import { RESPONSE_PACKAGE_VERSION_REPOSITORY, type ResponsePackageVersionRepository } from "../ports/response-package-version.repository";
import { ListResponsePackagesUseCase } from "./list-response-packages.use-case";

export type GetSubmittableResponsePackageVersionQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

export type SubmittableResponsePackageVersion = Readonly<{
  responsePackageId: string;
  responsePackageVersionId: string;
  versionNumber: number;
  artifactId: string;
  artifactChecksum: string;
  artifactFileName: string;
}>;

/** Checkpoint TENDEROS-2.1-P2.2-F2, mission §29/§67 — résultat discriminé de la résolution :
 *  - `RESOLVED` : provenance V2 capturable sans ambiguïté.
 *  - `AMBIGUOUS_OR_ABSENT` : 0 ou plusieurs `ResponsePackage` pour ce Tender (multi-lot), pas de
 *    version courante, ou version courante non validée — structurellement pas résolvable sans
 *    deviner ; NON-BLOQUANT, le dépôt legacy continue normalement sans provenance V2 (mission §16).
 *  - `ARTIFACT_MISSING` : résolution SANS AMBIGUÏTÉ (exactement un dossier, version courante
 *    validée) mais AUCUN artefact (ZIP) n'a jamais été généré pour cette version — anomalie qui doit
 *    BLOQUER le dépôt (mission §67 "refus propre, pas de Submission enregistrée"), distincte du cas
 *    ambigu ci-dessus qui lui ne bloque jamais.
 */
export type SubmittableResponsePackageVersionResolution =
  | (Readonly<{ status: "RESOLVED" }> & SubmittableResponsePackageVersion)
  | Readonly<{ status: "AMBIGUOUS_OR_ABSENT" }>
  | Readonly<{ status: "ARTIFACT_MISSING"; responsePackageId: string; responsePackageVersionId: string }>;

/**
 * Checkpoint TENDEROS-2.1-P2.2-F2 — autorité UNIQUE de résolution "quelle ResponsePackageVersion
 * serait soumise MAINTENANT" (mission §6), réexportée pour `submission`. Compose des LECTURES pures
 * de use cases/repositories déjà existants — ne recalcule AUCUNE règle de fraîcheur/validation
 * (mission §7/§10 "réutiliser la SOT existante, ne pas inventer une nouvelle notion de
 * validation") : `Submission Readiness`/`RecordTenderSubmissionUseCase` restent seuls responsables
 * de BLOQUER un dépôt sur la base de cette fraîcheur ; ce use case se contente de résoudre, sans
 * jamais lui-même refuser ou avertir — c'est à l'appelant d'interpréter `status`.
 *
 * Résolution volontairement CONSERVATRICE (mission §82 "STOP plutôt que refonte") : si plusieurs
 * `ResponsePackage` existent pour ce Tender (Tenders multi-lot, chacun avec son propre dossier —
 * `TenderSubmission` reste structurellement Tender-scope, jamais lot-scope, voir KNOWN_GAPS du
 * rapport final), la résolution retourne `AMBIGUOUS_OR_ABSENT` plutôt que de choisir arbitrairement
 * l'un des lots — la soumission continue alors via le flux legacy uniquement, sans provenance V2
 * capturée pour ce cas précis (documenté, jamais une refonte de `TenderSubmission`).
 */
@Injectable()
export class GetSubmittableResponsePackageVersionUseCase {
  constructor(
    private readonly listResponsePackagesUseCase: ListResponsePackagesUseCase,
    @Inject(RESPONSE_PACKAGE_VERSION_REPOSITORY) private readonly versionRepository: ResponsePackageVersionRepository,
    @Inject(PACKAGE_ARTIFACT_REPOSITORY) private readonly artifactRepository: PackageArtifactRepository,
  ) {}

  async execute(query: GetSubmittableResponsePackageVersionQuery): Promise<SubmittableResponsePackageVersionResolution> {
    const packages = await this.listResponsePackagesUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId });
    if (packages.length !== 1) {
      return { status: "AMBIGUOUS_OR_ABSENT" };
    }
    const pkg = packages[0]!;
    if (!pkg.currentVersionId) {
      return { status: "AMBIGUOUS_OR_ABSENT" };
    }

    const version = await this.versionRepository.findById({ organizationId: query.organizationId, responsePackageVersionId: pkg.currentVersionId });
    if (!version || !version.isValidated) {
      return { status: "AMBIGUOUS_OR_ABSENT" };
    }

    const artifacts = await this.artifactRepository.listByVersion({ organizationId: query.organizationId, responsePackageVersionId: version.id });
    const latestArtifact = artifacts[0];
    if (!latestArtifact) {
      return { status: "ARTIFACT_MISSING", responsePackageId: pkg.id, responsePackageVersionId: version.id };
    }

    return {
      status: "RESOLVED",
      responsePackageId: pkg.id,
      responsePackageVersionId: version.id,
      versionNumber: version.versionNumber,
      artifactId: latestArtifact.id,
      artifactChecksum: latestArtifact.checksum,
      artifactFileName: latestArtifact.fileName,
    };
  }
}
