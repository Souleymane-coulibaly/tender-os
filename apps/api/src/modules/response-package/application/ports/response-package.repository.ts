import type { ResponsePackage } from "../../domain/response-package.aggregate";
import type { ResponsePackageStatus } from "../../domain/enums";

/** V2 Sprint 15 (Dashboard) — ligne allégée pour l'agrégation portfolio, jamais l'agrégat complet
 *  (mission §53 "read model", évite de rehydrater le domaine pour un simple comptage/jointure). */
export type ResponsePackageDashboardRow = Readonly<{ id: string; tenderId: string; lotId: string | null; clientAccountId: string; status: ResponsePackageStatus }>;

export interface ResponsePackageRepository {
  create(pkg: ResponsePackage): Promise<void>;
  save(pkg: ResponsePackage): Promise<void>;
  findById(input: { organizationId: string; responsePackageId: string }): Promise<ResponsePackage | null>;
  /** Détection de doublon (mission §10/§104 — un dossier de réponse par Tender/lot/candidate).
   *  `lotId: null` cible le périmètre "tous lots"/global, une valeur cible un lot précis — jamais
   *  confondus (index partiel unique, même motif que `PricingScheduleRepository.findByScope`). */
  findByScope(input: { organizationId: string; tenderId: string; lotId: string | null; clientAccountId: string }): Promise<ResponsePackage | null>;
  list(input: { organizationId: string; tenderId: string; lotId?: string | undefined; clientAccountId?: string | undefined }): Promise<readonly ResponsePackage[]>;
  /** V2 Sprint 15 (Dashboard) — une seule requête (`ResponsePackage.status` est déjà dénormalisé
   *  depuis la version courante, mission §64 "ne pas recalculer la readiness différemment du Sprint
   *  14") sur l'ensemble du périmètre ClientAccess résolu par l'appelant, jamais un
   *  `GetPackageCompletenessUseCase` par package (mission §54 "pas de N+1"). `restrictToClientAccountIds
   *  undefined` = aucune restriction (OWNER/ADMIN), même convention que `TenderRepository.list`. */
  listForDashboard(input: { organizationId: string; restrictToClientAccountIds?: readonly string[] | undefined }): Promise<readonly ResponsePackageDashboardRow[]>;
}

export const RESPONSE_PACKAGE_REPOSITORY = Symbol("RESPONSE_PACKAGE_REPOSITORY");
