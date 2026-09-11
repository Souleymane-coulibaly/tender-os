import { PlatformApiError } from "../../../lib/platform-api-client";
import { apiErrorMessage, describeApiError } from "../../../lib/api-error-messages";

/**
 * État "erreur" / "accès refusé" partagé par les pages du back-office plateforme
 * (skills/platform-foundation/FRONTEND_PATTERNS.md §26 — états UI obligatoires).
 * N'affiche jamais le texte renvoyé par l'API : le message vient de la table française
 * des codes d'erreur (lib/api-error-messages.ts).
 */
export function ApiErrorState({ error }: { error: unknown }) {
  if (error instanceof PlatformApiError) {
    if (error.status === 403) {
      return (
        <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          {apiErrorMessage(error) ?? "Accès refusé : vous n'avez pas les droits nécessaires pour cette page."}
        </div>
      );
    }

    if (error.status === 401) {
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

  return (
    <div role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
      Une erreur inattendue est survenue.
    </div>
  );
}
