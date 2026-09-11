"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../../components/ui";
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
    <Card title="Utilisateurs affectés">
      <div className="flex flex-col gap-3">
        {assignments.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun utilisateur affecté à ce client pour le moment.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Utilisateur</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Rôle client</TableHeaderCell>
                <TableHeaderCell>Affecté le</TableHeaderCell>
                {canManage ? <TableHeaderCell>Actions</TableHeaderCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {assignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell className="font-medium text-tenderos-navy">{assignment.user.displayName}</TableCell>
                  <TableCell className="text-tenderos-slate">{assignment.user.email}</TableCell>
                  <TableCell>
                    {canManage ? (
                      <Select
                        aria-label={`Rôle client de ${assignment.user.displayName}`}
                        defaultValue={assignment.role}
                        disabled={pendingId === assignment.id}
                        onChange={(event) => handleRoleChange(assignment.id, event.target.value)}
                      >
                        {CLIENT_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {CLIENT_ROLE_LABELS[role]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      CLIENT_ROLE_LABELS[assignment.role]
                    )}
                  </TableCell>
                  <TableCell className="text-tenderos-slate">{new Date(assignment.createdAt).toLocaleDateString("fr-FR")}</TableCell>
                  {canManage ? (
                    <TableCell>
                      <Button type="button" variant="danger" size="sm" onClick={() => handleRemove(assignment.id)} disabled={pendingId === assignment.id}>
                        Retirer
                      </Button>
                    </TableCell>
                  ) : null}
                  {errors[assignment.id] ? (
                    <TableCell colSpan={5}>
                      <p role="alert" className="text-xs text-danger-fg">
                        {errors[assignment.id]}
                      </p>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {canManage ? <AssignUserForm clientId={clientId} candidates={candidates} /> : null}
      </div>
    </Card>
  );
}
