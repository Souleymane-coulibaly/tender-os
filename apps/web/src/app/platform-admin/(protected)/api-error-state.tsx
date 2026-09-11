import { apiErrorMessage, describeApiError } from "../../../lib/api-error-messages";
import { SERVICE_UNREACHABLE_MESSAGE, asApiError, isNetworkFailure } from "../../../lib/page-load-error";

/** Jetons d'état (DESIGN_SYSTEM.md §1) — même carte que l'état d'erreur de l'espace organisation.
 *  Un `<div role="alert">` plutôt que `Alert` : `Alert` pose `role="status"` pour un ton
 *  `warning`, alors que chaque variante de cet écran doit rester annoncée comme une alerte. */
const WARNING_CLASSES = "rounded-2xl border border-tenderos-navy/10 bg-warning-bg p-4 text-sm text-warning-fg shadow-sm";
const DANGER_CLASSES = "rounded-2xl border border-tenderos-navy/10 bg-danger-bg p-4 text-sm text-danger-fg shadow-sm";

/**
 * État "erreur" / "accès refusé" partagé par les pages du back-office plateforme
 * (skills/platform-foundation/FRONTEND_PATTERNS.md §26 — états UI obligatoires).
 * N'affiche jamais le texte renvoyé par l'API : le message vient de la table française
 * des codes d'erreur (lib/api-error-messages.ts).
 *
 * Erreur d'API reconnue par sa FORME (statut + code), jamais par `instanceof` — même motif que
 * app/(protected)/api-error-state.tsx ; toute erreur non reconnue est journalisée côté serveur.
 */
export function ApiErrorState({ error }: { error: unknown }) {
  const apiError = asApiError(error);
  if (apiError) {
    if (apiError.status === 403) {
      return (
        <div role="alert" className={WARNING_CLASSES}>
          {apiErrorMessage(error) ?? "Accès refusé : vous n'avez pas les droits nécessaires pour cette page."}
        </div>
      );
    }

    if (apiError.status === 401) {
      return (
        <div role="alert" className={WARNING_CLASSES}>
          Votre session a expiré. Reconnectez-vous.
        </div>
      );
    }

    return (
      <div role="alert" className={DANGER_CLASSES}>
        {describeApiError(error)}
      </div>
    );
  }

  console.error("[TenderOS] Platform Admin page data load failed (not an API response):", error);
  return (
    <div role="alert" className={DANGER_CLASSES}>
      {isNetworkFailure(error)
        ? SERVICE_UNREACHABLE_MESSAGE
        : "Une erreur inattendue est survenue. Réessayez ; si le problème persiste, contactez le support."}
    </div>
  );
}
