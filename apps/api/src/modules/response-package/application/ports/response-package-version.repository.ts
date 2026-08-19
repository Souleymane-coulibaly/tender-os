import type { ResponsePackageVersion } from "../../domain/response-package-version.entity";

export interface ResponsePackageVersionRepository {
  /** Checkpoint 2.1-P2.1-FIX-E — verrou consultatif scopé au `ResponsePackage`, même motif que
   *  `TechnicalMemoSectionRevisionRepository.lockSection` : pris AVANT `list`/`create` dans la même
   *  transaction courte, sérialise deux constructions concurrentes de la même lignée. */
  lockPackage(input: { organizationId: string; responsePackageId: string }): Promise<void>;
  create(version: ResponsePackageVersion): Promise<void>;
  save(version: ResponsePackageVersion): Promise<void>;
  findById(input: { organizationId: string; responsePackageVersionId: string }): Promise<ResponsePackageVersion | null>;
  /** Historique APPEND-ONLY complet (mission §11), du plus récent au plus ancien. */
  list(input: { organizationId: string; responsePackageId: string }): Promise<readonly ResponsePackageVersion[]>;
}

export const RESPONSE_PACKAGE_VERSION_REPOSITORY = Symbol("RESPONSE_PACKAGE_VERSION_REPOSITORY");
