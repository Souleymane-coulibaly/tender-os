import { cookies } from "next/headers";

/**
 * Client API typé pour l'espace organisation (`/app`), côté serveur uniquement — même
 * principe que platform-api-client.ts : le jeton de session ne quitte jamais le serveur.
 * Contrairement au back-office plateforme, chaque appel porte aussi X-Organization-Id
 * (OrganizationMembershipGuard le revalide toujours contre une Membership active réelle).
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export const APP_SESSION_COOKIE = "tenderos_app_session";
export const APP_ORGANIZATION_COOKIE = "tenderos_app_organization_id";

export class AppApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppApiError";
  }
}

export async function getAppSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(APP_SESSION_COOKIE)?.value;
}

export async function getAppOrganizationId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(APP_ORGANIZATION_COOKIE)?.value;
}

async function parseErrorBody(response: Response): Promise<never> {
  const body: unknown = await response.json().catch(() => null);
  const errorBody = body as { error?: { code?: string; message?: string } } | null;
  throw new AppApiError(
    response.status,
    errorBody?.error?.code ?? "UNKNOWN_ERROR",
    errorBody?.error?.message ?? "Unexpected error.",
  );
}

export async function appApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const [token, organizationId] = await Promise.all([getAppSessionToken(), getAppOrganizationId()]);

  if (!token) {
    throw new AppApiError(401, "AUTHENTICATION_REQUIRED", "No session.");
  }
  if (!organizationId) {
    throw new AppApiError(400, "ORGANIZATION_ID_HEADER_REQUIRED", "No organization selected.");
  }

  // FormData (upload multipart d'un Document) ne doit jamais recevoir un Content-Type manuel :
  // fetch/undici calcule seul la frontiere multipart correcte a partir du corps.
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      "X-Organization-Id": organizationId,
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (response.status === 204) {
    return undefined as T;
  }
  if (!response.ok) {
    return parseErrorBody(response);
  }

  return (await response.json()) as T;
}

/**
 * Résout le rôle de l'utilisateur courant dans l'organisation active — nécessaire côté UI
 * uniquement pour un confort d'affichage (griser le glisser-déposer, masquer une action)
 * jamais comme autorité : chaque mutation reste revalidée côté API quoi que montre l'UI.
 */
export async function getCurrentMembershipRole(): Promise<string | undefined> {
  const organizationId = await getAppOrganizationId();
  if (!organizationId) return undefined;

  const page = await appApiFetch<{ items: { role: string; organization: { id: string } }[] }>(
    "/api/v1/organization-memberships/me?limit=100",
  );

  return page.items.find((item) => item.organization.id === organizationId)?.role;
}

export async function appApiFetchWithToken<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return parseErrorBody(response);
  }

  return (await response.json()) as T;
}
