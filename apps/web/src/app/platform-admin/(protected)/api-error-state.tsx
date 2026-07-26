import { PlatformApiError } from "../../../lib/platform-api-client";

/**
 * État "erreur" / "accès refusé" partagé par les pages du back-office plateforme
 * (skills/platform-foundation/FRONTEND_PATTERNS.md §26 — états UI obligatoires).
 * N'affiche jamais le détail technique brut : uniquement le message déjà pensé pour
 * l'utilisateur final côté API.
 */
export function ApiErrorState({ error }: { error: unknown }) {
  if (error instanceof PlatformApiError) {
    if (error.status === 403) {
      return (
        <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Accès refusé : {error.message}
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
        {error.message}
      </div>
    );
  }

  return (
    <div role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
      Une erreur inattendue est survenue.
    </div>
  );
}
