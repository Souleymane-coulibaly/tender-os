"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type {
  ApprovalEntityType,
  ApprovalRequest,
  Comment,
  CommentEntityType,
  Task,
  TaskPriority,
  TaskStatus,
  TenderActivityPage,
  TenderCollaborativeRole,
  TenderParticipant,
} from "../../lib/workspace-types";
import { apiErrorMessage } from "../../lib/api-error-messages";

export type WorkspaceActionState = { error?: string };

/** Ne laisse jamais un message backend brut atteindre un composant — même motif que
 *  `describeAiSuggestionActionError`/`describeAnalysisActionError`. */
function describeWorkspaceActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Workspace action failed (${error.status} ${error.code}): ${error.message}`);
    const known = apiErrorMessage(error);
    if (known) return known;
    switch (error.status) {
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
      case 404:
        return "Introuvable ou accès refusé.";
      case 409:
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 422:
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a workspace action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

// ---- Members ----

export type WorkspaceMember = { userId: string; email: string; displayName: string };

/** Répertoire minimal (id/email/displayName), gouverné par l'accès Workspace (ReadWorkspace) —
 *  jamais l'endpoint d'administration organisationnelle `/organization-memberships`, qui exige
 *  `organization:member:list` (réservé OWNER/ORGANIZATION_ADMIN) et bloquerait un CONTRIBUTOR
 *  pourtant autorisé à collaborer sur ce Tender (`TenderPermission.ManageWorkspace`). */
export async function fetchWorkspaceMembers(tenderId: string): Promise<WorkspaceMember[]> {
  return appApiFetch<WorkspaceMember[]>(`/api/v1/tenders/${tenderId}/workspace-members`);
}

// ---- Participants ----

export async function fetchParticipants(tenderId: string): Promise<TenderParticipant[]> {
  return appApiFetch<TenderParticipant[]>(`/api/v1/tenders/${tenderId}/participants`);
}

export async function addParticipantAction(
  tenderId: string,
  input: { userId: string; role: TenderCollaborativeRole; justification?: string },
): Promise<WorkspaceActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/participants`, { method: "POST", body: JSON.stringify(input) });
  } catch (error) {
    return { error: describeWorkspaceActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/workspace`);
  return {};
}

export async function removeParticipantAction(tenderId: string, participantId: string): Promise<WorkspaceActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/participants/${participantId}`, { method: "DELETE" });
  } catch (error) {
    return { error: describeWorkspaceActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/workspace`);
  return {};
}

export async function changeParticipantRoleAction(tenderId: string, participantId: string, role: TenderCollaborativeRole): Promise<WorkspaceActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/participants/${participantId}`, { method: "PATCH", body: JSON.stringify({ role }) });
  } catch (error) {
    return { error: describeWorkspaceActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/workspace`);
  return {};
}

// ---- Tasks ----

export async function fetchTasks(tenderId: string): Promise<Task[]> {
  return appApiFetch<Task[]>(`/api/v1/tenders/${tenderId}/tasks`);
}

export async function createTaskAction(
  tenderId: string,
  input: { title: string; description?: string; priority?: TaskPriority; dueDate?: string; lotId?: string; checklistItemId?: string; assigneeId?: string },
): Promise<WorkspaceActionState & { task?: Task }> {
  try {
    const task = await appApiFetch<Task>(`/api/v1/tenders/${tenderId}/tasks`, { method: "POST", body: JSON.stringify(input) });
    revalidatePath(`/app/tenders/${tenderId}/workspace`);
    revalidatePath(`/app/tenders/${tenderId}`);
    return { task };
  } catch (error) {
    return { error: describeWorkspaceActionError(error) };
  }
}

/** V2 Sprint 7 §14 — "Créer une tâche" depuis un ChecklistItem : préremplit titre/priorité/lot,
 *  mais ne fixe JAMAIS de responsable (mission "laisser l'utilisateur confirmer... ne pas affecter
 *  automatiquement un utilisateur par IA") — l'assignation se fait ensuite, explicitement, dans
 *  l'onglet Workspace. */
export async function createTaskFromChecklistItemAction(
  tenderId: string,
  input: { title: string; priority: string; dueDate?: string; checklistItemId: string; lotId?: string },
): Promise<WorkspaceActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        priority: input.priority,
        checklistItemId: input.checklistItemId,
        ...(input.lotId ? { lotId: input.lotId } : {}),
        ...(input.dueDate ? { dueDate: new Date(input.dueDate).toISOString() } : {}),
      }),
    });
  } catch (error) {
    return { error: describeWorkspaceActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/workspace`);
  return {};
}

export async function assignTaskAction(tenderId: string, taskId: string, assigneeId: string | undefined): Promise<WorkspaceActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/tasks/${taskId}/assign`, { method: "POST", body: JSON.stringify({ assigneeId }) });
  } catch (error) {
    return { error: describeWorkspaceActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/workspace`);
  return {};
}

export async function changeTaskStatusAction(tenderId: string, taskId: string, status: TaskStatus): Promise<WorkspaceActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/tasks/${taskId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  } catch (error) {
    return { error: describeWorkspaceActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/workspace`);
  revalidatePath(`/app/me/tasks`);
  return {};
}

export async function completeTaskAction(tenderId: string, taskId: string): Promise<WorkspaceActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/tasks/${taskId}/complete`, { method: "POST" });
  } catch (error) {
    return { error: describeWorkspaceActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/workspace`);
  revalidatePath(`/app/me/tasks`);
  return {};
}

export async function reopenTaskAction(tenderId: string, taskId: string): Promise<WorkspaceActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/tasks/${taskId}/reopen`, { method: "POST" });
  } catch (error) {
    return { error: describeWorkspaceActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/workspace`);
  revalidatePath(`/app/me/tasks`);
  return {};
}

// ---- Comments ----

export async function fetchComments(tenderId: string, entityType: CommentEntityType, entityId: string): Promise<Comment[]> {
  return appApiFetch<Comment[]>(`/api/v1/tenders/${tenderId}/comments?entityType=${entityType}&entityId=${entityId}`);
}

export async function createCommentAction(
  tenderId: string,
  input: { entityType: CommentEntityType; entityId: string; body: string; mentionedUserIds?: string[] },
): Promise<WorkspaceActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/comments`, { method: "POST", body: JSON.stringify(input) });
  } catch (error) {
    return { error: describeWorkspaceActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/workspace`);
  return {};
}

// ---- Approvals ----

export async function fetchApprovals(tenderId: string): Promise<ApprovalRequest[]> {
  return appApiFetch<ApprovalRequest[]>(`/api/v1/tenders/${tenderId}/approvals`);
}

export async function requestApprovalAction(
  tenderId: string,
  input: { entityType: ApprovalEntityType; entityId: string; reviewerId: string; comment?: string },
): Promise<WorkspaceActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/approvals`, { method: "POST", body: JSON.stringify(input) });
  } catch (error) {
    return { error: describeWorkspaceActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/workspace`);
  return {};
}

export async function approveApprovalAction(tenderId: string, approvalId: string, comment?: string): Promise<WorkspaceActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/approvals/${approvalId}/approve`, { method: "POST", body: JSON.stringify(comment ? { comment } : {}) });
  } catch (error) {
    return { error: describeWorkspaceActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/workspace`);
  return {};
}

export async function requestApprovalChangesAction(tenderId: string, approvalId: string, comment?: string): Promise<WorkspaceActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/approvals/${approvalId}/request-changes`, { method: "POST", body: JSON.stringify(comment ? { comment } : {}) });
  } catch (error) {
    return { error: describeWorkspaceActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/workspace`);
  return {};
}

/** V2 Sprint 18 (mission §27/§34) — raison OBLIGATOIRE (jamais un refus muet), distinct de
 *  `requestApprovalChangesAction` ("à corriger") : un refus définitif. */
export async function rejectApprovalAction(tenderId: string, approvalId: string, reason: string): Promise<WorkspaceActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/approvals/${approvalId}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
  } catch (error) {
    return { error: describeWorkspaceActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/workspace`);
  revalidatePath("/app/validations");
  return {};
}

// ---- Mes validations (Review Center, V2 Sprint 18 mission §63-65) ----

export async function fetchMyApprovals(filters?: { status?: ApprovalRequest["status"]; clientAccountId?: string }): Promise<ApprovalRequest[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.clientAccountId) params.set("clientAccountId", filters.clientAccountId);
  const query = params.toString();
  return appApiFetch<ApprovalRequest[]>(`/api/v1/me/approvals${query ? `?${query}` : ""}`);
}

// ---- Activity ----

export async function fetchActivity(tenderId: string, cursor?: string): Promise<TenderActivityPage> {
  const query = cursor ? `?cursor=${cursor}` : "";
  return appApiFetch<TenderActivityPage>(`/api/v1/tenders/${tenderId}/activity${query}`);
}

// ---- Mes tâches ----

export async function fetchMyTasks(filters?: { status?: TaskStatus; overdueOnly?: boolean }): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.overdueOnly) params.set("overdueOnly", "true");
  const query = params.toString();
  return appApiFetch<Task[]>(`/api/v1/me/tasks${query ? `?${query}` : ""}`);
}
