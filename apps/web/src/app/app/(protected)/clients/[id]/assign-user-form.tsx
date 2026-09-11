"use client";

import { useActionState } from "react";
import { Button, Select } from "../../../../../components/ui";
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
    return <p className="text-sm text-tenderos-slate">Tous les membres de l&apos;organisation sont déjà affectés à ce client.</p>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <Select label="Utilisateur" id="userId" name="userId" required wrapperClassName="min-w-56 flex-1 sm:max-w-sm">
        {candidates.map((user) => (
          <option key={user.id} value={user.id}>
            {user.displayName} ({user.email}) — {user.role}
          </option>
        ))}
      </Select>
      <Select label="Rôle client" id="role" name="role" required defaultValue="VIEWER" wrapperClassName="basis-48">
        {CLIENT_ROLES.map((role) => (
          <option key={role} value={role}>
            {CLIENT_ROLE_LABELS[role]}
          </option>
        ))}
      </Select>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Affectation..." : "Affecter"}
      </Button>
      {state.error ? (
        <p role="alert" className="w-full text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
