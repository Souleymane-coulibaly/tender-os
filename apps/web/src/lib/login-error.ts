import { API_ERROR_MESSAGES } from "./api-error-messages";

const WRONG_CREDENTIALS_MESSAGE = API_ERROR_MESSAGES.INVALID_CREDENTIALS ?? "L'adresse e-mail ou le mot de passe est incorrect.";
const TOO_MANY_ATTEMPTS_MESSAGE = API_ERROR_MESSAGES.TOO_MANY_REQUESTS ?? "Trop de tentatives. Patientez un instant avant de réessayer.";
const SERVER_ERROR_MESSAGE = "Une erreur serveur est survenue. Veuillez réessayer.";

/**
 * Message français d'une connexion refusée par `POST /api/v1/auth/login`.
 *
 * Pourquoi un traducteur dédié plutôt que `describeApiError` : sur l'écran de connexion, un 401 sans
 * code signifie « identifiants refusés », pas « session expirée » (le repli générique des autres
 * écrans). Et surtout, tout refus n'est pas une erreur d'identifiants : un compte ralenti par la
 * limite de tentatives (429), un compte désactivé ou une panne serveur doivent être dits tels quels —
 * répondre « identifiants invalides » à un utilisateur ralenti l'enverrait réinitialiser un mot de
 * passe parfaitement correct.
 */
export async function describeLoginFailure(response: Response): Promise<string> {
  const code = await readErrorCode(response);
  if (code && API_ERROR_MESSAGES[code]) return API_ERROR_MESSAGES[code];
  if (response.status === 429) return TOO_MANY_ATTEMPTS_MESSAGE;
  if (response.status >= 500) return SERVER_ERROR_MESSAGE;
  return WRONG_CREDENTIALS_MESSAGE;
}

/** Code d'erreur de l'enveloppe `{ error: { code } }` de l'API ; `undefined` si le corps n'en porte pas. */
async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === "string" ? body.error.code : undefined;
  } catch {
    return undefined;
  }
}
