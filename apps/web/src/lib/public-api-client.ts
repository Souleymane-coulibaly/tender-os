// V2 Sprint 23 (landing) — fetch PUBLIC, jamais de cookie de session/`X-Organization-Id` (contrairement
// à `app-api-client.ts`/`platform-api-client.ts`) : la Landing fonctionne sans compte (mission §2).
// Revalidation courte (5 min) plutôt qu'un fetch à chaque requête — le catalogue change rarement,
// mission §47 "performance".
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export class PublicApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "PublicApiError";
  }
}

export async function publicApiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { next: { revalidate: 300 } });
  if (!response.ok) {
    throw new PublicApiError(response.status, `Public API request to ${path} failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Jamais de `cache`/`revalidate` sur une mutation (mission — un `POST` public reste toujours
 *  exécuté, jamais servi depuis un cache Next.js). */
export async function publicApiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new PublicApiError(response.status, `Public API request to ${path} failed with status ${response.status}`);
  }
  // V2 Sprint 24 (mot de passe oublié) — /auth/forgot-password et /auth/reset-password renvoient
  // 204 sans corps (jamais un JSON vide, qui ferait échouer response.json()) — même garde que
  // appApiFetch.
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
