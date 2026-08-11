import type { PackageArtifact } from "../../domain/package-artifact.value-object";

export interface PackageArtifactRepository {
  create(artifact: PackageArtifact): Promise<void>;
  listByVersion(input: { organizationId: string; responsePackageVersionId: string }): Promise<readonly PackageArtifact[]>;
}

export const PACKAGE_ARTIFACT_REPOSITORY = Symbol("PACKAGE_ARTIFACT_REPOSITORY");
