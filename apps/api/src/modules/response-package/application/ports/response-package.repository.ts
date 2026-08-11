import type { ResponsePackage } from "../../domain/response-package.aggregate";

export interface ResponsePackageRepository {
  create(pkg: ResponsePackage): Promise<void>;
  save(pkg: ResponsePackage): Promise<void>;
  findById(input: { organizationId: string; responsePackageId: string }): Promise<ResponsePackage | null>;
  /** Détection de doublon (mission §10/§104 — un dossier de réponse par Tender/lot/candidate).
   *  `lotId: null` cible le périmètre "tous lots"/global, une valeur cible un lot précis — jamais
   *  confondus (index partiel unique, même motif que `PricingScheduleRepository.findByScope`). */
  findByScope(input: { organizationId: string; tenderId: string; lotId: string | null; clientAccountId: string }): Promise<ResponsePackage | null>;
  list(input: { organizationId: string; tenderId: string; lotId?: string | undefined; clientAccountId?: string | undefined }): Promise<readonly ResponsePackage[]>;
}

export const RESPONSE_PACKAGE_REPOSITORY = Symbol("RESPONSE_PACKAGE_REPOSITORY");
