/**
 * Lecture d'une erreur de chargement de page, pour les écrans d'erreur (`ApiErrorState`) et les
 * actions qui doivent distinguer « l'API a refusé » de « l'API est injoignable ».
 *
 * Pourquoi par la FORME et non par `instanceof` : dans Next.js, une erreur levée depuis un fichier
 * d'actions serveur peut provenir d'une autre instance du module client que celle importée par la
 * page — `instanceof AppApiError` échoue alors, et un vrai refus de l'API passait pour une « erreur
 * inattendue ». Une erreur d'API se reconnaît à son statut HTTP et à son code.
 */

export type ApiErrorShape = { status: number; code: string };

export const SERVICE_UNREACHABLE_MESSAGE = "Le service TenderOS est momentanément injoignable. Réessayez dans un instant.";

export function asApiError(error: unknown): ApiErrorShape | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as Partial<ApiErrorShape>;
  return typeof candidate.status === "number" && typeof candidate.code === "string" ? { status: candidate.status, code: candidate.code } : undefined;
}

const NETWORK_ERROR_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"]);

/** L'API n'a pas répondu du tout (service arrêté, en redémarrage, réseau) — jamais un refus. */
export function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = (error as { cause?: unknown }).cause;
  const causeCode = typeof cause === "object" && cause !== null ? (cause as { code?: unknown }).code : undefined;
  const nestedCodes =
    cause instanceof AggregateError ? cause.errors.map((inner) => (inner as { code?: unknown }).code) : [];
  return (
    (error instanceof TypeError && /fetch failed/i.test(error.message)) ||
    [causeCode, ...nestedCodes].some((code) => typeof code === "string" && NETWORK_ERROR_CODES.has(code))
  );
}
