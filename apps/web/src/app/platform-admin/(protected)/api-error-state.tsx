import { apiErrorMessage, describeApiError } from "../../../lib/api-error-messages";
import { SERVICE_UNREACHABLE_MESSAGE, asApiError, isNetworkFailure } from "../../../lib/page-load-error";

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
        <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          {apiErrorMessage(error) ?? "Accès refusé : vous n'avez pas les droits nécessaires pour cette page."}
        </div>
      );
    }

    if (apiError.status === 401) {
      return (
        <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Votre session a expiré. Reconnectez-vous.
        </div>
      );
    }

    return (
      <div role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        {describeApiError(error)}
      </div>
    );
  }

  console.error("[TenderOS] Platform Admin page data load failed (not an API response):", error);
  return (
    <div role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
      {isNetworkFailure(error)
        ? SERVICE_UNREACHABLE_MESSAGE
        : "Une erreur inattendue est survenue. Réessayez ; si le problème persiste, contactez le support."}
    </div>
  );
}
