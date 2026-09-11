import { apiErrorMessage, describeApiError } from "../../../lib/api-error-messages";
import { SERVICE_UNREACHABLE_MESSAGE, asApiError, isNetworkFailure } from "../../../lib/page-load-error";

/**
 * État "erreur" / "accès refusé" partagé par les pages de l'espace organisation — même
 * motif que platform-admin/(protected)/api-error-state.tsx. N'affiche jamais le texte renvoyé
 * par l'API : le message vient de la table française des codes d'erreur (lib/api-error-messages.ts).
 *
 * Une erreur d'API est reconnue par sa FORME (statut + code), jamais par `instanceof` : une erreur
 * levée depuis une action serveur peut venir d'une autre instance du module client (voir
 * lib/page-load-error.ts). Toute erreur non reconnue est JOURNALISÉE côté serveur — sans cela, un
 * écran « erreur inattendue » en production ne laissait aucune trace exploitable.
 */
export function ApiErrorState({ error }: { error: unknown }) {
  const apiError = asApiError(error);
  if (apiError) {
    if (apiError.status === 404) {
      return (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
          {apiErrorMessage(error) ?? "Cet élément est introuvable, ou vous n'y avez pas accès."}
        </div>
      );
    }

    if (apiError.status === 403) {
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

    if (apiError.status === 401) {
      return (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
          Votre session a expiré. Reconnectez-vous.
        </div>
      );
    }

    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
        {describeApiError(error)}
      </div>
    );
  }

  console.error("[TenderOS] Page data load failed (not an API response):", error);
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
      {isNetworkFailure(error)
        ? SERVICE_UNREACHABLE_MESSAGE
        : "Une erreur inattendue est survenue. Réessayez ; si le problème persiste, contactez le support."}
    </div>
  );
}
