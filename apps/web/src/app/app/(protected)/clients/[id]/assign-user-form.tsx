"use client";

import { useActionState } from "react";
import { assignUserToClientAction, type FormActionState } from "../../../client-portfolio-actions";
import { CLIENT_ROLES, CLIENT_ROLE_LABELS } from "../../../../../lib/client-portfolio-types";

export type AssignableUser = { id: string; email: string; displayName: string; role: string };

const INITIAL_STATE: FormActionState = {};

/** N'affiche que les membres de l'organisation active NON encore affectés à ce client (mission
 *  §"jamais autoriser l'affectation d'un utilisateur d'une autre organisation") — la liste vient
 *  déjà de `/organization-memberships` (scopée à l'organisation active), jamais d'une saisie libre
 *  d'identifiant. */
export function AssignUserForm({ clientId, candidates }: { clientId: string; candidates: AssignableUser[] }) {
  const boundAction = assignUserToClientAction.bind(null, clientId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  if (candidates.length === 0) {
    return <p className="text-sm text-neutral-600">Tous les membres de l&apos;organisation sont déjà affectés à ce client.</p>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="userId" className="text-xs text-neutral-600">
          Utilisateur
        </label>
        <select id="userId" name="userId" required className="min-w-56 rounded border border-neutral-300 px-2 py-1.5 text-sm">
          {candidates.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName} ({user.email}) — {user.role}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="role" className="text-xs text-neutral-600">
          Rôle client
        </label>
        <select id="role" name="role" required defaultValue="VIEWER" className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
          {CLIENT_ROLES.map((role) => (
            <option key={role} value={role}>
              {CLIENT_ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={isPending} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Affectation..." : "Affecter"}
      </button>
      {state.error ? (
        <p role="alert" className="w-full text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
