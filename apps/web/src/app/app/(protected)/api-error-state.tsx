import { AppApiError } from "../../../lib/app-api-client";

/**
 * État "erreur" / "accès refusé" partagé par les pages de l'espace organisation — même
 * motif que platform-admin/(protected)/api-error-state.tsx. N'affiche jamais le détail
 * technique brut, seulement le message déjà pensé pour l'utilisateur final côté API.
 */
export function ApiErrorState({ error }: { error: unknown }) {
  if (error instanceof AppApiError) {
    if (error.status === 404) {
      return (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
          Introuvable ou accès refusé : {error.message}
        </div>
      );
    }

    if (error.status === 403) {
      return (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
          Accès refusé : {error.message}
        </div>
      );
    }

    if (error.status === 401) {
      return (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
          Votre session a expiré. Reconnectez-vous.
        </div>
      );
    }

    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
        {error.message}
      </div>
    );
  }

  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
      Une erreur inattendue est survenue.
    </div>
  );
}
