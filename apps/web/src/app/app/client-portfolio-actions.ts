"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { ClientAccountSummary, ClientAssignmentSummary } from "../../lib/client-portfolio-types";
import { apiErrorMessage } from "../../lib/api-error-messages";

export type FormActionState = { error?: string };

/**
 * Messages français par statut HTTP (mission Sprint 5.1 §"États et erreurs à gérer") — jamais une
 * pile d'appel, un code Prisma brut, ou l'identifiant interne d'une autre organisation exposés à
 * l'utilisateur ; les détails techniques restent en `console.error` côté serveur uniquement. Même
 * motif que `describeTenderActionError` (src/app/app/actions.ts).
 */
function describeClientPortfolioActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Client portfolio action failed (${error.status} ${error.code}): ${error.message}`);
    const known = apiErrorMessage(error);
    if (known) return known;
    switch (error.status) {
      case 400:
        return "Certains champs sont invalides.";
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
      case 404:
        return "Ce client est introuvable ou vous n'y avez pas accès.";
      case 409:
        return "Cette action entre en conflit avec l'état actuel de ce client.";
      case 422:
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a client portfolio action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

function optional(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function createClientAccountAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Le nom du client est obligatoire." };
  }

  let client: ClientAccountSummary;
  try {
    client = await appApiFetch<ClientAccountSummary>("/api/v1/clients", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        legalName: optional(formData.get("legalName")),
        reference: optional(formData.get("reference")),
        sector: optional(formData.get("sector")),
        country: optional(formData.get("country")),
        address: optional(formData.get("address")),
        website: optional(formData.get("website")),
        notes: optional(formData.get("notes")),
        status: optional(formData.get("status")),
      }),
    });
  } catch (error) {
    return { error: describeClientPortfolioActionError(error) };
  }

  revalidatePath("/app/clients");
  redirect(`/app/clients/${client.id}`);
}

export async function updateClientAccountAction(
  clientId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Le nom du client est obligatoire." };
  }

  try {
    await appApiFetch(`/api/v1/clients/${clientId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: name.trim(),
        legalName: optional(formData.get("legalName")),
        reference: optional(formData.get("reference")),
        sector: optional(formData.get("sector")),
        country: optional(formData.get("country")),
        address: optional(formData.get("address")),
        website: optional(formData.get("website")),
        notes: optional(formData.get("notes")),
      }),
    });
  } catch (error) {
    return { error: describeClientPortfolioActionError(error) };
  }

  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/app/clients");
  return {};
}

export async function archiveClientAccountAction(clientId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/clients/${clientId}/archive`, { method: "POST" });
  } catch (error) {
    return { error: describeClientPortfolioActionError(error) };
  }

  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/app/clients");
  return {};
}

export async function restoreClientAccountAction(clientId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/clients/${clientId}/restore`, { method: "POST" });
  } catch (error) {
    return { error: describeClientPortfolioActionError(error) };
  }

  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/app/clients");
  return {};
}

export async function deleteClientAccountAction(clientId: string): Promise<{ error?: string } | void> {
  try {
    await appApiFetch(`/api/v1/clients/${clientId}`, { method: "DELETE" });
  } catch (error) {
    return { error: describeClientPortfolioActionError(error) };
  }

  revalidatePath("/app/clients");
  redirect("/app/clients");
}

export async function assignUserToClientAction(
  clientId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const userId = formData.get("userId");
  const role = formData.get("role");
  if (typeof userId !== "string" || !userId.trim()) {
    return { error: "Sélectionnez un utilisateur." };
  }
  if (typeof role !== "string" || !role.trim()) {
    return { error: "Sélectionnez un rôle client." };
  }

  try {
    await appApiFetch<ClientAssignmentSummary>(`/api/v1/clients/${clientId}/assignments`, {
      method: "POST",
      body: JSON.stringify({ userId, role }),
    });
  } catch (error) {
    return { error: describeClientPortfolioActionError(error) };
  }

  revalidatePath(`/app/clients/${clientId}`);
  return {};
}

export async function updateClientAssignmentAction(clientId: string, assignmentId: string, role: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/clients/${clientId}/assignments/${assignmentId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  } catch (error) {
    return { error: describeClientPortfolioActionError(error) };
  }

  revalidatePath(`/app/clients/${clientId}`);
  return {};
}

export async function removeClientAssignmentAction(clientId: string, assignmentId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/clients/${clientId}/assignments/${assignmentId}`, { method: "DELETE" });
  } catch (error) {
    return { error: describeClientPortfolioActionError(error) };
  }

  revalidatePath(`/app/clients/${clientId}`);
  return {};
}
