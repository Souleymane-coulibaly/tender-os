import { cookies } from "next/headers";

/**
 * Client API typé, côté serveur uniquement (Server Components / Server Actions) —
 * le frontend n'accède jamais directement à l'API depuis le navigateur pour le
 * back-office plateforme (skills/platform-foundation/FRONTEND_PATTERNS.md §6, §36).
 * Le jeton de session ne quitte jamais le serveur (cookie httpOnly, jamais transmis
 * à un Client Component ni au localStorage).
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export const PLATFORM_SESSION_COOKIE = "tenderos_platform_session";

export class PlatformApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PlatformApiError";
  }
}

export async function getPlatformSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(PLATFORM_SESSION_COOKIE)?.value;
}

/**
 * N'accorde jamais d'autorité côté client : chaque appel est revalidé par
 * AuthenticatedGuard + PlatformAccessGuard + la policy de capacité côté API,
 * ce module ne fait que relayer la requête et traduire la réponse.
 */
export async function platformApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getPlatformSessionToken();

  if (!token) {
    throw new PlatformApiError(401, "AUTHENTICATION_REQUIRED", "No platform session.");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody = body as { error?: { code?: string; message?: string } } | null;
    const code = errorBody?.error?.code ?? "UNKNOWN_ERROR";
    const message = errorBody?.error?.message ?? "Unexpected error.";
    throw new PlatformApiError(response.status, code, message);
  }

  return body as T;
}

export async function platformApiFetchWithToken<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
    cache: "no-store",
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody = body as { error?: { code?: string; message?: string } } | null;
    const code = errorBody?.error?.code ?? "UNKNOWN_ERROR";
    const message = errorBody?.error?.message ?? "Unexpected error.";
    throw new PlatformApiError(response.status, code, message);
  }

  return body as T;
}
