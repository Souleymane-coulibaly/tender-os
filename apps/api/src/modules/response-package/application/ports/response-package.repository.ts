import type { ResponsePackage } from "../../domain/response-package.aggregate";
import type { ResponsePackageStatus } from "../../domain/enums";

/** V2 Sprint 15 (Dashboard) — ligne allégée pour l'agrégation portfolio, jamais l'agrégat complet
 *  (mission §53 "read model", évite de rehydrater le domaine pour un simple comptage/jointure). */
export type ResponsePackageDashboardRow = Readonly<{ id: string; tenderId: string; lotId: string | null; clientAccountId: string; status: ResponsePackageStatus }>;

export type ResponsePackageDashboardScope = Readonly<{
  organizationId: string;
  restrictToClientAccountIds?: readonly string[] | undefined;
  clientAccountId?: string | undefined;
}>;

/** Seuls les statuts réellement présents sont renseignés — un statut absent vaut 0, jamais une clé
 *  fabriquée (même convention que `TenderRepository.countByStatus`). */
export type ResponsePackageCountByStatus = Readonly<Partial<Record<ResponsePackageStatus, number>>>;

export interface ResponsePackageRepository {
  create(pkg: ResponsePackage): Promise<void>;
  save(pkg: ResponsePackage): Promise<void>;
  findById(input: { organizationId: string; responsePackageId: string }): Promise<ResponsePackage | null>;
  /** Détection de doublon (mission §10/§104 — un dossier de réponse par Tender/lot/candidate).
   *  `lotId: null` cible le périmètre "tous lots"/global, une valeur cible un lot précis — jamais
   *  confondus (index partiel unique, même motif que `PricingScheduleRepository.findByScope`). */
  findByScope(input: { organizationId: string; tenderId: string; lotId: string | null; clientAccountId: string }): Promise<ResponsePackage | null>;
  list(input: { organizationId: string; tenderId: string; lotId?: string | undefined; clientAccountId?: string | undefined }): Promise<readonly ResponsePackage[]>;
  /** Checkpoint TENDEROS-2.1-P2.3-E12 (Dashboard unbounded query) — périmètre de lecture Dashboard.
   *  `restrictToClientAccountIds undefined` = aucune restriction d'accès (OWNER/ADMIN), même
   *  convention que `TenderRepository.list` ; `clientAccountId` est le filtre explicitement demandé
   *  par l'utilisateur. Les deux se composent en INTERSECTION dans l'implémentation, jamais en
   *  réunion : un filtre hors périmètre accessible ne peut que réduire à zéro, jamais élargir. */
  /** V2 Sprint 15 (Dashboard) — `ResponsePackage.status` est déjà dénormalisé depuis la version
   *  courante (mission §64 "ne pas recalculer la readiness différemment du Sprint 14"), jamais un
   *  `GetPackageCompletenessUseCase` par package (mission §54 "pas de N+1").
   *
   *  Checkpoint TENDEROS-2.1-P2.3-E12 — remplace `listForDashboard`, qui matérialisait TOUTES les
   *  lignes du portefeuille pour n'en produire que des COMPTEURS. CURRENT_STATE : agrégation exacte
   *  sur l'état courant global du portefeuille (jamais de faux cutoff temporel — un dossier prêt
   *  depuis 6 mois est toujours un dossier prêt), mais calculée par PostgreSQL (`GROUP BY status`),
   *  donc à coût mémoire constant quel que soit l'historique. */
  countByStatusForDashboard(scope: ResponsePackageDashboardScope): Promise<ResponsePackageCountByStatus>;
  /** Checkpoint TENDEROS-2.1-P2.3-E12 — les lignes détaillées ne sont nécessaires QUE pour les
   *  Tenders réellement rendus par le Dashboard (fenêtre de scan déjà bornée par l'appelant), pour
   *  y attacher les lots. Bornée par `tenderIds`, jamais par l'organisation entière. */
  listForDashboardTenders(scope: ResponsePackageDashboardScope & { tenderIds: readonly string[] }): Promise<readonly ResponsePackageDashboardRow[]>;
}

export const RESPONSE_PACKAGE_REPOSITORY = Symbol("RESPONSE_PACKAGE_REPOSITORY");
