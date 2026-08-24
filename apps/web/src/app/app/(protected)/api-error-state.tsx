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
      // Checkpoint TENDEROS-2.1-P2.3-E7 (mission §43, bug trouvé en revue visuelle réelle sur
      // /app/members) — `error.message` porte le message brut du domaine backend (ex.
      // "Missing permission: organization:member:list.", `PermissionMissingError`), un identifiant
      // technique destiné aux logs/développeurs, jamais à un utilisateur final. Message fixe,
      // jamais le détail technique — contrairement à 404/401 où le message reste contextuel.
      return (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
          Accès refusé : vous n&apos;avez pas la permission nécessaire pour accéder à cette page.
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
