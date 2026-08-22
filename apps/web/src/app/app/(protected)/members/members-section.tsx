"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addMemberAction, changeMemberRoleAction, removeMemberAction, suspendMemberAction } from "../../membership-actions";
import { ASSIGNABLE_ROLES, MEMBERSHIP_STATUS_LABELS, ORGANIZATION_ROLE_LABELS, membershipStatusBadgeClass, type OrganizationMemberResponse } from "../../../../lib/membership-types";

function AddMemberForm() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState(false);

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded border border-neutral-200 bg-neutral-50 p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setIsPending(true);
        setError(undefined);
        setSuccess(false);
        const formData = new FormData(event.currentTarget);
        const result = await addMemberAction({ userId: String(formData.get("userId")).trim(), role: String(formData.get("role")) });
        setIsPending(false);
        if (result.error) {
          setError(result.error);
          return;
        }
        setSuccess(true);
        (event.target as HTMLFormElement).reset();
        router.refresh();
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="member-user-id" className="text-xs font-medium text-neutral-600">
          Identifiant utilisateur TenderOS
        </label>
        <input
          id="member-user-id"
          name="userId"
          required
          placeholder="uuid de l'utilisateur"
          className="w-72 rounded border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="member-role" className="text-xs font-medium text-neutral-600">
          Rôle
        </label>
        <select id="member-role" name="role" defaultValue="CONTRIBUTOR" className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
          {ASSIGNABLE_ROLES.map((role) => (
            <option key={role} value={role}>
              {ORGANIZATION_ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={isPending} className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50">
        {isPending ? "Ajout..." : "Ajouter"}
      </button>
      {error ? (
        <p role="alert" className="w-full text-xs text-red-600">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="w-full text-xs text-green-700">
          Membre ajouté.
        </p>
      ) : null}
      <p className="w-full text-xs text-neutral-500">
        La personne doit déjà posséder un compte TenderOS. L&apos;invitation par email n&apos;est pas encore disponible.
      </p>
    </form>
  );
}

function MemberRow({ member, currentUserId }: { member: OrganizationMemberResponse; currentUserId: string | undefined }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleRoleChange(role: string) {
    if (role === member.role) return;
    setIsPending(true);
    setError(undefined);
    const result = await changeMemberRoleAction(member.id, role);
    setIsPending(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  async function handleSuspend() {
    setIsPending(true);
    setError(undefined);
    const result = await suspendMemberAction(member.id);
    setIsPending(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  async function handleRemove() {
    if (!window.confirm(`Retirer ${member.user.displayName} de l'organisation ?`)) return;
    setIsPending(true);
    setError(undefined);
    const result = await removeMemberAction(member.id);
    setIsPending(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  const isSelf = member.userId === currentUserId;
  const isActive = member.status === "ACTIVE";

  return (
    <tr className="border-b border-neutral-100">
      <td className="py-2 pr-4 font-medium text-neutral-900">
        {member.user.displayName}
        {isSelf ? <span className="ml-1 text-xs text-neutral-400">(vous)</span> : null}
      </td>
      <td className="py-2 pr-4 text-neutral-600">{member.user.email}</td>
      <td className="py-2 pr-4">
        {member.role === "OWNER" ? (
          <span className="text-neutral-700">{ORGANIZATION_ROLE_LABELS.OWNER}</span>
        ) : (
          <select
            value={member.role}
            disabled={isPending || !isActive}
            onChange={(event) => handleRoleChange(event.target.value)}
            className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50"
          >
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ORGANIZATION_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="py-2 pr-4">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${membershipStatusBadgeClass(member.status)}`}>{MEMBERSHIP_STATUS_LABELS[member.status]}</span>
      </td>
      <td className="py-2 pr-4">
        {member.role !== "OWNER" && isActive ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={isPending} onClick={handleSuspend} className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-50">
              Suspendre
            </button>
            <button type="button" disabled={isPending} onClick={handleRemove} className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800 hover:bg-red-100 disabled:opacity-50">
              Retirer
            </button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="mt-1 text-xs text-red-600">
            {error}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

export function MembersSection({ members, canManage, currentUserId }: { members: OrganizationMemberResponse[]; canManage: boolean; currentUserId: string | undefined }) {
  return (
    <div className="flex flex-col gap-4">
      {canManage ? <AddMemberForm /> : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2 pr-4">Nom</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Rôle</th>
              <th className="py-2 pr-4">Statut</th>
              {canManage ? <th className="py-2 pr-4">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {members.map((member) =>
              canManage ? (
                <MemberRow key={member.id} member={member} currentUserId={currentUserId} />
              ) : (
                <tr key={member.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-medium text-neutral-900">{member.user.displayName}</td>
                  <td className="py-2 pr-4 text-neutral-600">{member.user.email}</td>
                  <td className="py-2 pr-4 text-neutral-600">{ORGANIZATION_ROLE_LABELS[member.role]}</td>
                  <td className="py-2 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${membershipStatusBadgeClass(member.status)}`}>{MEMBERSHIP_STATUS_LABELS[member.status]}</span>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
