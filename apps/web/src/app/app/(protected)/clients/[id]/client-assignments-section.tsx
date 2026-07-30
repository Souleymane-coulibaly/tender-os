"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeClientAssignmentAction, updateClientAssignmentAction } from "../../../client-portfolio-actions";
import { CLIENT_ROLES, CLIENT_ROLE_LABELS, type ClientAssignmentView } from "../../../../../lib/client-portfolio-types";
import { AssignUserForm, type AssignableUser } from "./assign-user-form";

export function ClientAssignmentsSection({
  clientId,
  assignments,
  candidates,
  canManage,
}: {
  clientId: string;
  assignments: ClientAssignmentView[];
  candidates: AssignableUser[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleRoleChange(assignmentId: string, role: string) {
    setPendingId(assignmentId);
    const result = await updateClientAssignmentAction(clientId, assignmentId, role);
    setPendingId(undefined);
    setErrors((prev) => ({ ...prev, [assignmentId]: result.error ?? "" }));
    if (!result.error) router.refresh();
  }

  async function handleRemove(assignmentId: string) {
    setPendingId(assignmentId);
    const result = await removeClientAssignmentAction(clientId, assignmentId);
    setPendingId(undefined);
    setErrors((prev) => ({ ...prev, [assignmentId]: result.error ?? "" }));
    if (!result.error) router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-neutral-900">Utilisateurs affectés</h2>

      {assignments.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun utilisateur affecté à ce client pour le moment.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Utilisateur</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Rôle client</th>
                <th className="py-2 pr-4">Affecté le</th>
                {canManage ? <th className="py-2 pr-4">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-medium text-neutral-900">{assignment.user.displayName}</td>
                  <td className="py-2 pr-4 text-neutral-600">{assignment.user.email}</td>
                  <td className="py-2 pr-4">
                    {canManage ? (
                      <select
                        aria-label={`Rôle client de ${assignment.user.displayName}`}
                        defaultValue={assignment.role}
                        disabled={pendingId === assignment.id}
                        onChange={(event) => handleRoleChange(assignment.id, event.target.value)}
                        className="rounded border border-neutral-300 px-2 py-1 text-xs"
                      >
                        {CLIENT_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {CLIENT_ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      CLIENT_ROLE_LABELS[assignment.role]
                    )}
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{new Date(assignment.createdAt).toLocaleDateString("fr-FR")}</td>
                  {canManage ? (
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        onClick={() => handleRemove(assignment.id)}
                        disabled={pendingId === assignment.id}
                        className="text-red-700 hover:underline disabled:opacity-50"
                      >
                        Retirer
                      </button>
                    </td>
                  ) : null}
                  {errors[assignment.id] ? (
                    <td colSpan={5}>
                      <p role="alert" className="text-xs text-red-600">
                        {errors[assignment.id]}
                      </p>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage ? <AssignUserForm clientId={clientId} candidates={candidates} /> : null}
    </div>
  );
}
