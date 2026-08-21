import { Inject, Injectable } from "@nestjs/common";
import type { ResponsePackageRequirement, ResponsePackageRequirementCandidate } from "../../domain/services/resolve-response-package-requirements";
import { PACKAGE_ARTIFACT_REPOSITORY, type PackageArtifactRepository } from "../ports/package-artifact.repository";
import { RESPONSE_PACKAGE_VERSION_REPOSITORY, type ResponsePackageVersionRepository } from "../ports/response-package-version.repository";
import { GetRequiredResponsePackagesForTenderUseCase } from "./get-required-response-packages-for-tender.use-case";

export type GetSubmittableResponsePackageVersionQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

export type SubmittableResponsePackageVersion = Readonly<{
  responsePackageId: string;
  responsePackageVersionId: string;
  versionNumber: number;
  artifactId: string;
  artifactChecksum: string;
  artifactFileName: string;
  /** Checkpoint TENDEROS-2.1-P2.2-F4.1 — référence de stockage de l'artefact, déjà lue par
   *  `resolveRequirement` (jamais une seconde requête) : permet à un appelant en LECTURE SEULE
   *  (`submission-package`, mission "PackageArtifact V2 devient la source de contenu") d'embarquer
   *  l'artefact V2 tel quel, sans accéder directement au repository interne de ce module. */
  artifactStorageKey: string;
  artifactMimeType: string;
  artifactSizeBytes: number;
}>;

/** Checkpoint TENDEROS-2.1-P2.2-F2.3, mission §8 — une entrée de provenance résolue pour un lot
 *  REQUIS (mode LOT uniquement, voir `ResolvedMultiLot` ci-dessous). */
export type SubmittableResponsePackageVersionForLot = SubmittableResponsePackageVersion & Readonly<{ lotId: string }>;

/** Checkpoint TENDEROS-2.1-P2.2-F2/F2.3, mission §29/§67/§8 — résultat discriminé de la résolution :
 *  - `RESOLVED` : mode GLOBAL (aucun lot requis n'a de dossier qui lui est explicitement scopé,
 *    mission §5/§18 "préserver F2/F2.1 tel quel") — provenance V2 capturable sans ambiguïté, un seul
 *    dossier. Comportement STRICTEMENT identique à F2 (mêmes champs, mêmes conditions).
 *  - `RESOLVED_MULTI_LOT` : mode LOT (mission §7/§13) — un dossier requis PAR LOT sélectionné pour
 *    candidature, tous résolus sans ambiguïté (CURRENT + validé + artefact présent).
 *  - `AMBIGUOUS_OR_ABSENT` : mode GLOBAL uniquement — 0 ou plusieurs dossiers globaux, pas de version
 *    courante, ou version courante non validée — structurellement pas résolvable sans deviner ;
 *    NON-BLOQUANT, le dépôt legacy continue normalement sans provenance V2 (mission §16).
 *  - `ARTIFACT_MISSING` : résolution SANS AMBIGUÏTÉ (dossier identifié, version courante validée)
 *    mais AUCUN artefact (ZIP) n'a jamais été généré pour cette version — anomalie qui doit BLOQUER
 *    le dépôt (mission §67/§30), `lotId` renseigné en mode LOT.
 *  - `LOT_RESPONSE_PACKAGE_MISSING` : mode LOT uniquement (mission §13/§14) — au moins un lot REQUIS
 *    (jamais un lot non sélectionné) n'a aucun dossier résolvable (absent, pas CURRENT, ou non
 *    validé) — BLOQUANT, jamais un dépôt partiel (mission §20/§29).
 */
export type SubmittableResponsePackageVersionResolution =
  | (Readonly<{ status: "RESOLVED" }> & SubmittableResponsePackageVersion)
  | Readonly<{ status: "RESOLVED_MULTI_LOT"; entries: readonly SubmittableResponsePackageVersionForLot[] }>
  | Readonly<{ status: "AMBIGUOUS_OR_ABSENT" }>
  | Readonly<{ status: "ARTIFACT_MISSING"; responsePackageId: string; responsePackageVersionId: string; lotId?: string | undefined }>
  | Readonly<{ status: "LOT_RESPONSE_PACKAGE_MISSING"; missingLotIds: readonly string[] }>;

type SingleRequirementResolution =
  | Readonly<{ outcome: "RESOLVED" } & SubmittableResponsePackageVersion>
  | Readonly<{ outcome: "UNRESOLVED" }>
  | Readonly<{ outcome: "ARTIFACT_MISSING"; responsePackageId: string; responsePackageVersionId: string }>;

/**
 * Checkpoint TENDEROS-2.1-P2.2-F2/F2.3 — autorité UNIQUE de résolution "quelle(s)
 * ResponsePackageVersion serai(en)t soumise(s) MAINTENANT" (mission §6/§12 "ne pas créer de moteur
 * de résolution concurrent"), réexportée pour `submission`. Compose des LECTURES pures de use
 * cases/repositories déjà existants — ne recalcule AUCUNE règle de fraîcheur/validation (mission
 * §7/§10/§29 "réutiliser la SOT existante") : `Submission Readiness`/`RecordTenderSubmissionUseCase`
 * restent seuls responsables de BLOQUER un dépôt sur la base de cette fraîcheur ; ce use case se
 * contente de résoudre, sans jamais lui-même refuser ou avertir — c'est à l'appelant d'interpréter
 * `status`.
 *
 * Mode déterminé par `GetRequiredResponsePackagesForTenderUseCase` (mission §3, SOT
 * `TenderLot.selectedForResponse`) — GLOBAL (une seule entrée, `lotId: undefined`) ou LOT (une
 * entrée par lot réellement sélectionné pour candidature). Jamais un mode choisi arbitrairement ici.
 */
@Injectable()
export class GetSubmittableResponsePackageVersionUseCase {
  constructor(
    private readonly getRequiredResponsePackagesForTenderUseCase: GetRequiredResponsePackagesForTenderUseCase,
    @Inject(RESPONSE_PACKAGE_VERSION_REPOSITORY) private readonly versionRepository: ResponsePackageVersionRepository,
    @Inject(PACKAGE_ARTIFACT_REPOSITORY) private readonly artifactRepository: PackageArtifactRepository,
  ) {}

  async execute(query: GetSubmittableResponsePackageVersionQuery): Promise<SubmittableResponsePackageVersionResolution> {
    const requirements = await this.getRequiredResponsePackagesForTenderUseCase.execute(query);

    // Mode GLOBAL — mission §5/§18 : comportement F2/F2.1 STRICTEMENT inchangé.
    if (requirements.length === 1 && requirements[0]!.lotId === undefined) {
      const resolution = await this.resolveRequirement(query.organizationId, requirements[0]!);
      if (resolution.outcome === "UNRESOLVED") return { status: "AMBIGUOUS_OR_ABSENT" };
      if (resolution.outcome === "ARTIFACT_MISSING") return { status: "ARTIFACT_MISSING", responsePackageId: resolution.responsePackageId, responsePackageVersionId: resolution.responsePackageVersionId };
      const { outcome: _outcome, ...resolved } = resolution;
      return { status: "RESOLVED", ...resolved };
    }

    // Mode LOT — mission §7/§13 : chaque lot requis doit résoudre sans ambiguïté.
    const missingLotIds: string[] = [];
    const entries: SubmittableResponsePackageVersionForLot[] = [];
    for (const requirement of requirements) {
      const lotId = requirement.lotId!;
      const resolution = await this.resolveRequirement(query.organizationId, requirement);
      if (resolution.outcome === "UNRESOLVED") {
        missingLotIds.push(lotId);
        continue;
      }
      if (resolution.outcome === "ARTIFACT_MISSING") {
        return { status: "ARTIFACT_MISSING", responsePackageId: resolution.responsePackageId, responsePackageVersionId: resolution.responsePackageVersionId, lotId };
      }
      const { outcome: _outcome, ...resolved } = resolution;
      entries.push({ ...resolved, lotId });
    }
    if (missingLotIds.length > 0) {
      return { status: "LOT_RESPONSE_PACKAGE_MISSING", missingLotIds };
    }
    return { status: "RESOLVED_MULTI_LOT", entries };
  }

  /** Résout UN créneau requis (global ou un lot précis) — même logique exacte que F2 (mission §17
   *  "réutiliser les règles existantes"), factorisée pour être appliquée identiquement en mode
   *  GLOBAL et en mode LOT (mission §33 "parité"). */
  private async resolveRequirement(organizationId: string, requirement: ResponsePackageRequirement): Promise<SingleRequirementResolution> {
    if (requirement.matchingPackages.length !== 1) {
      return { outcome: "UNRESOLVED" };
    }
    const pkg: ResponsePackageRequirementCandidate = requirement.matchingPackages[0]!;
    if (!pkg.currentVersionId) {
      return { outcome: "UNRESOLVED" };
    }

    const version = await this.versionRepository.findById({ organizationId, responsePackageVersionId: pkg.currentVersionId });
    if (!version || !version.isValidated) {
      return { outcome: "UNRESOLVED" };
    }

    const artifacts = await this.artifactRepository.listByVersion({ organizationId, responsePackageVersionId: version.id });
    const latestArtifact = artifacts[0];
    if (!latestArtifact) {
      return { outcome: "ARTIFACT_MISSING", responsePackageId: pkg.id, responsePackageVersionId: version.id };
    }

    return {
      outcome: "RESOLVED",
      responsePackageId: pkg.id,
      responsePackageVersionId: version.id,
      versionNumber: version.versionNumber,
      artifactId: latestArtifact.id,
      artifactChecksum: latestArtifact.checksum,
      artifactFileName: latestArtifact.fileName,
      artifactStorageKey: latestArtifact.storageKey,
      artifactMimeType: latestArtifact.mimeType,
      artifactSizeBytes: latestArtifact.sizeBytes,
    };
  }
}
