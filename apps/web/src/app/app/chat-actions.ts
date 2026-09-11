"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { Conversation, Message } from "../../lib/chat-types";
import { apiErrorMessage } from "../../lib/api-error-messages";

export type ChatActionState = { error?: string };

/** Ne laisse jamais un message backend brut atteindre un composant — même motif que
 *  `describeWorkspaceActionError`/`describeAnalysisActionError`. */
function describeChatActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Chat action failed (${error.status} ${error.code}): ${error.message}`);
    const known = apiErrorMessage(error);
    if (known) return known;
    switch (error.status) {
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour utiliser l'assistant IA sur ce Tender.";
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
  console.error("[TenderOS] Unexpected error during a chat action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function fetchConversations(tenderId: string, includeArchived?: boolean): Promise<Conversation[]> {
  const query = includeArchived ? "?includeArchived=true" : "";
  return appApiFetch<Conversation[]>(`/api/v1/tenders/${tenderId}/conversations${query}`);
}

export async function createConversationAction(tenderId: string, input: { title?: string; lotId?: string }): Promise<ChatActionState & { conversation?: Conversation }> {
  try {
    const conversation = await appApiFetch<Conversation>(`/api/v1/tenders/${tenderId}/conversations`, { method: "POST", body: JSON.stringify(input) });
    revalidatePath(`/app/tenders/${tenderId}/assistant`);
    return { conversation };
  } catch (error) {
    return { error: describeChatActionError(error) };
  }
}

export async function archiveConversationAction(tenderId: string, conversationId: string): Promise<ChatActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/conversations/${conversationId}/archive`, { method: "POST" });
  } catch (error) {
    return { error: describeChatActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/assistant`);
  return {};
}

export async function fetchMessages(tenderId: string, conversationId: string): Promise<Message[]> {
  return appApiFetch<Message[]>(`/api/v1/tenders/${tenderId}/conversations/${conversationId}/messages`);
}

/** Synchrone (mission décision §1) — cette action ne répond qu'une fois la génération terminée
 *  (COMPLETED ou FAILED), jamais un accusé de réception suivi d'un streaming. */
export async function sendMessageAction(tenderId: string, conversationId: string, content: string): Promise<ChatActionState & { message?: Message }> {
  try {
    const message = await appApiFetch<Message>(`/api/v1/tenders/${tenderId}/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ content }) });
    return { message };
  } catch (error) {
    return { error: describeChatActionError(error) };
  }
}
