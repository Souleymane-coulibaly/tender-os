"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { BrowseResult, ConnectorProvider, ExternalConnectionSummary } from "../../lib/connectors-types";

function describeConnectorsActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Connectors action failed (${error.status} ${error.code}): ${error.message}`);
    switch (error.status) {
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
      case 404:
        if (error.code === "EXTERNAL_CONNECTION_CLIENT_NOT_ALLOWED") return "Cette connexion n'est pas autorisée pour ce client.";
        return "Introuvable ou accès refusé.";
      case 409:
        if (error.code === "EXTERNAL_CONNECTION_ALREADY_EXISTS") return "Une connexion existe déjà pour ce provider — déconnectez-la d'abord.";
        if (error.code === "EXTERNAL_CONNECTION_NOT_USABLE") return "Cette connexion nécessite une reconnexion.";
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 422:
        if (error.code === "UNSUPPORTED_REMOTE_FILE_TYPE") return "Ce type de fichier (Google natif) ne peut pas être importé automatiquement.";
        if (error.code === "TENDER_DEADLINE_NOT_SET") return "Cet appel d'offres n'a pas de date limite définie.";
        return "Certains champs sont invalides.";
      case 429:
        return "Le provider limite le nombre de requêtes — réessayez dans quelques instants.";
      case 502:
        return "Le provider externe est momentanément indisponible.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a connectors action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function fetchExternalConnections(): Promise<ExternalConnectionSummary[]> {
  return appApiFetch<ExternalConnectionSummary[]>("/api/v1/connectors");
}

export type TenderPickerOption = { id: string; title: string; clientAccountId: string };
export async function fetchTendersForPicker(): Promise<TenderPickerOption[]> {
  const page = await appApiFetch<{ items: { id: string; title: string; clientAccountId: string }[] }>("/api/v1/tenders?limit=100");
  return page.items.map((t) => ({ id: t.id, title: t.title, clientAccountId: t.clientAccountId }));
}

export type DocumentPickerOption = { id: string; title: string; currentVersion: { id: string; versionNumber: number } };
export async function fetchDocumentsForPicker(): Promise<DocumentPickerOption[]> {
  const page = await appApiFetch<{ items: DocumentPickerOption[] }>("/api/v1/documents?limit=100&sort=updatedAt&sortDirection=desc");
  return page.items;
}

export type InitiateConnectionResult = { error?: string; authorizationUrl?: string };

export async function initiateConnectionAction(provider: ConnectorProvider, name: string): Promise<InitiateConnectionResult> {
  try {
    const result = await appApiFetch<{ authorizationUrl: string }>("/api/v1/connectors", { method: "POST", body: JSON.stringify({ provider, name }) });
    return { authorizationUrl: result.authorizationUrl };
  } catch (error) {
    return { error: describeConnectorsActionError(error) };
  }
}

export async function reauthorizeConnectionAction(connectionId: string): Promise<InitiateConnectionResult> {
  try {
    const result = await appApiFetch<{ authorizationUrl: string }>(`/api/v1/connectors/${connectionId}/reauthorize`, { method: "POST" });
    return { authorizationUrl: result.authorizationUrl };
  } catch (error) {
    return { error: describeConnectorsActionError(error) };
  }
}

export async function disconnectConnectionAction(connectionId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/connectors/${connectionId}`, { method: "DELETE" });
  } catch (error) {
    return { error: describeConnectorsActionError(error) };
  }
  revalidatePath("/app/integrations/connectors");
  return {};
}

/** `clientAccountId` — requis côté backend si la connexion est restreinte
 * (`allowedClientAccountIds` non vide) et que l'acteur n'a pas `ConnectorPermission.Manage`
 * (correctif audit P2 : la navigation elle-même respecte désormais le narrowing, pas seulement
 * l'import/export). */
export async function browseRemoteFolder(connectionId: string, containerId?: string, folderId?: string, clientAccountId?: string): Promise<BrowseResult> {
  const params = new URLSearchParams();
  if (containerId) params.set("containerId", containerId);
  if (folderId) params.set("folderId", folderId);
  if (clientAccountId) params.set("clientAccountId", clientAccountId);
  const query = params.toString() ? `?${params.toString()}` : "";
  return appApiFetch<BrowseResult>(`/api/v1/connectors/${connectionId}/browse${query}`);
}

export type ImportFileInput = { containerId: string; fileId: string; mimeType: string; clientAccountId?: string | undefined; tenderId?: string | undefined; title?: string | undefined };
export async function importRemoteFileAction(connectionId: string, input: ImportFileInput): Promise<{ error?: string; documentId?: string }> {
  try {
    const result = await appApiFetch<{ id: string }>(`/api/v1/connectors/${connectionId}/import`, { method: "POST", body: JSON.stringify(input) });
    return { documentId: result.id };
  } catch (error) {
    return { error: describeConnectorsActionError(error) };
  }
}

export type ExportVersionInput = { containerId: string; folderId: string; documentId: string; versionId: string; clientAccountId?: string | undefined; filename?: string | undefined };
export async function exportDocumentVersionAction(connectionId: string, input: ExportVersionInput): Promise<{ error?: string; remoteFileId?: string }> {
  try {
    const result = await appApiFetch<{ id: string }>(`/api/v1/connectors/${connectionId}/export`, { method: "POST", body: JSON.stringify(input) });
    return { remoteFileId: result.id };
  } catch (error) {
    return { error: describeConnectorsActionError(error) };
  }
}

export async function createCalendarEventAction(connectionId: string, tenderId: string): Promise<{ error?: string; externalEventId?: string; alreadyExisted?: boolean }> {
  try {
    const result = await appApiFetch<{ externalEventId: string; alreadyExisted: boolean }>(`/api/v1/connectors/${connectionId}/calendar-events`, { method: "POST", body: JSON.stringify({ tenderId }) });
    return { externalEventId: result.externalEventId, alreadyExisted: result.alreadyExisted };
  } catch (error) {
    return { error: describeConnectorsActionError(error) };
  }
}
