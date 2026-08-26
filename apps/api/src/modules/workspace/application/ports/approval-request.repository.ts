import type { ApprovalRequest } from "../../domain/approval-request.entity";

export interface ApprovalRequestRepository {
  findById(input: { organizationId: string; tenderId: string; approvalId: string }): Promise<ApprovalRequest | null>;
  listByTender(input: { organizationId: string; tenderId: string; status?: string | undefined }): Promise<ApprovalRequest[]>;
  /** V2 Sprint 18 (mission §63-65 "Mes validations") — cross-Tender, réservé aux demandes où
   *  `reviewerId === input.reviewerId`. `restrictToClientAccountIds` undefined = accès total
   *  (OWNER/ORGANIZATION_ADMIN), tableau vide = aucun accès (jamais un accès par défaut) — même
   *  convention que `TaskRepository.listByAssignee` (mission §35 "Mes tâches"). */
  listByReviewer(input: {
    organizationId: string;
    reviewerId: string;
    restrictToClientAccountIds?: readonly string[] | undefined;
    status?: string | undefined;
  }): Promise<ApprovalRequest[]>;
  /** Checkpoint TENDEROS-2.1-P2.3-E12.1 — MÊME périmètre exact que `listByReviewer` (mêmes
   *  prédicats, mêmes conventions de restriction), mais compté par PostgreSQL. Existe pour le KPI
   *  Dashboard "Validations en attente : N", qui n'avait besoin QUE du nombre et matérialisait
   *  pourtant toutes les lignes. Poser un `take` sur `listByReviewer` aurait au contraire rendu ce
   *  KPI silencieusement FAUX au-delà de la borne — un compteur ne doit jamais devenir inexact pour
   *  gagner en performance. */
  countByReviewer(input: {
    organizationId: string;
    reviewerId: string;
    restrictToClientAccountIds?: readonly string[] | undefined;
    status?: string | undefined;
  }): Promise<number>;
  /** Utilisée uniquement pour la CRÉATION (`RequestApprovalUseCase`) — aucune revue concurrente
   *  possible sur un enregistrement qui vient d'être inséré par cette même requête. */
  save(approval: ApprovalRequest): Promise<void>;
  /** V2 Sprint 7 (correctif concurrence, mission §48 "double approval") — charge, verrouille
   *  (`pg_advisory_xact_lock` scopé à `approvalId`) et applique `decide` en UNE seule transaction :
   *  empêche deux revues concurrentes de la même demande de toutes deux réussir. `decide` doit
   *  rester une fonction PURE de domaine (ex. `approval.approve(...)`), jamais d'I/O — même motif
   *  que `PrismaTenderLotRepository.createAppendedAtEnd` (verrou + lecture + mutation domaine +
   *  écriture, tout dans la même transaction). Lève `ApprovalRequestNotFoundError` si absent,
   *  propage l'erreur de `decide` (ex. `ApprovalRequestAlreadyReviewedError`) sans la capturer.
   */
  reviewLocked(input: { organizationId: string; tenderId: string; approvalId: string }, decide: (approval: ApprovalRequest) => void): Promise<ApprovalRequest>;
}

export const APPROVAL_REQUEST_REPOSITORY = Symbol("APPROVAL_REQUEST_REPOSITORY");
