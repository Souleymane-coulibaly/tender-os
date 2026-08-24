"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Dialog, EmptyState, Input, Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui";
import { changeMemberRoleAction, inviteMemberByEmailAction, removeMemberAction, suspendMemberAction } from "../../membership-actions";
import { ASSIGNABLE_ROLES, MEMBERSHIP_STATUS_LABELS, ORGANIZATION_ROLE_LABELS, membershipStatusTone, type OrganizationMemberResponse } from "../../../../lib/membership-types";
import { formatSeatUsage, type SeatUsage } from "../../../../lib/seat-usage";

/** Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, mission §14/§15/§23/§24) — invite par EMAIL
 *  (résolution serveur vers un compte existant, voir `inviteMemberByEmailAction`), jamais un
 *  identifiant technique. `seatUsage` reste une lecture d'affichage (mission §15 "le backend reste
 *  autoritaire") : le formulaire est désactivé quand `atLimit`, mais le VRAI refus, si contourné,
 *  reste `SEAT_LIMIT_EXCEEDED` (402) côté backend — jamais recalculé ici.
 *
 * Checkpoint TENDEROS-2.1-P2.3-E7 (Team & Users V2, mission §11) — le formulaire vit désormais
 * dans un `Dialog` déclenché par un CTA "Inviter un membre" (au lieu d'être toujours affiché inline)
 * pour rester cohérent avec le Design System E5.1 et avec l'exemple conceptuel de la mission §7. */
export function InviteMemberDialog({ seatUsage }: { seatUsage: SeatUsage | undefined }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const atLimit = seatUsage?.atLimit ?? false;

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        + Inviter un membre
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Inviter un membre">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setIsPending(true);
            setError(undefined);
            const formData = new FormData(event.currentTarget);
            const result = await inviteMemberByEmailAction({ email: String(formData.get("email")).trim(), role: String(formData.get("role")) });
            setIsPending(false);
            if (result.error) {
              setError(result.error);
              return;
            }
            setOpen(false);
            router.refresh();
          }}
        >
          <Input id="member-email" name="email" type="email" required disabled={atLimit} label="Email de la personne à inviter" placeholder="prenom.nom@entreprise.fr" />
          <Select id="member-role" name="role" defaultValue="CONTRIBUTOR" disabled={atLimit} label="Rôle">
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ORGANIZATION_ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
          {seatUsage ? (
            <p className="text-xs text-tenderos-slate">
              {formatSeatUsage(seatUsage)}
              {atLimit ? (
                <>
                  {" — "}
                  <a href="/app/subscription" className="font-medium text-tenderos-blue hover:underline">
                    changer d&apos;offre
                  </a>{" "}
                  pour inviter davantage de membres.
                </>
              ) : null}
            </p>
          ) : null}
          <p className="text-xs text-tenderos-slate">La personne doit déjà posséder un compte TenderOS avec cette adresse email pour être invitée immédiatement.</p>
          {error ? (
            <p role="alert" className="text-xs text-danger-fg">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" loading={isPending} disabled={atLimit} title={atLimit ? "Limite d'utilisateurs de votre offre atteinte." : undefined}>
              Inviter
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function MemberRow({ member, currentUserId, onRequestRemove }: { member: OrganizationMemberResponse; currentUserId: string | undefined; onRequestRemove: (member: OrganizationMemberResponse) => void }) {
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

  const isSelf = member.userId === currentUserId;
  const isActive = member.status === "ACTIVE";

  return (
    <TableRow>
      <TableCell className="font-medium text-tenderos-navy">
        {member.user.displayName}
        {isSelf ? <span className="ml-1 text-xs text-tenderos-slate">(vous)</span> : null}
      </TableCell>
      {/* Checkpoint TENDEROS-2.1-P2.3-E7 (mission §51, revue visuelle réelle 390px) — sans borne de
          largeur, une adresse email pousse Rôle/Statut/Actions hors écran (table compressée
          illisible, capture réelle `test-results/e7-members-list-390.png`). `max-w` + `truncate` +
          `title` (valeur complète toujours disponible) au lieu de toucher `Table`, primitive
          partagée par toute l'app. */}
      <TableCell className="max-w-[160px] truncate text-tenderos-slate" title={member.user.email}>
        {member.user.email}
      </TableCell>
      <TableCell>
        {member.role === "OWNER" ? (
          <span className="text-tenderos-navy">{ORGANIZATION_ROLE_LABELS.OWNER}</span>
        ) : (
          <Select aria-label={`Rôle de ${member.user.displayName}`} value={member.role} disabled={isPending || !isActive} onChange={(event) => handleRoleChange(event.target.value)}>
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ORGANIZATION_ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        )}
      </TableCell>
      <TableCell>
        <Badge tone={membershipStatusTone(member.status)}>{MEMBERSHIP_STATUS_LABELS[member.status]}</Badge>
      </TableCell>
      <TableCell>
        {member.role !== "OWNER" && isActive ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={handleSuspend}>
              Suspendre
            </Button>
            <Button type="button" variant="danger" size="sm" disabled={isPending} onClick={() => onRequestRemove(member)}>
              Retirer
            </Button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="mt-1 text-xs text-danger-fg">
            {error}
          </p>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function MembersSection({
  members,
  canManage,
  currentUserId,
}: {
  members: OrganizationMemberResponse[];
  canManage: boolean;
  currentUserId: string | undefined;
}) {
  const router = useRouter();
  const [pendingRemoval, setPendingRemoval] = useState<OrganizationMemberResponse | undefined>();
  const [removeError, setRemoveError] = useState<string | undefined>();
  const [isRemoving, setIsRemoving] = useState(false);

  async function confirmRemove() {
    if (!pendingRemoval) return;
    setIsRemoving(true);
    setRemoveError(undefined);
    const result = await removeMemberAction(pendingRemoval.id);
    setIsRemoving(false);
    if (result.error) {
      setRemoveError(result.error);
      return;
    }
    setPendingRemoval(undefined);
    router.refresh();
  }

  // Checkpoint TENDEROS-2.1-P2.3-E7 (mission §41, bug trouvé en revue visuelle réelle) —
  // `members.length === 0` ne se déclenche JAMAIS en pratique : l'API renvoie toujours AU MOINS la
  // propre affiliation de l'acteur courant (voir capture `e7-members-empty-1440.png`, 1er essai,
  // qui rendait un tableau à une seule ligne au lieu de l'état vide). "Aucun membre" veut dire
  // "aucun membre SUPPLÉMENTAIRE" (mission §41), donc exclure l'acteur courant du compte.
  if (members.every((member) => member.userId === currentUserId)) {
    return <EmptyState title="Aucun membre" description="Votre organisation n'a pas encore d'autre membre que vous." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Utilisateur</TableHeaderCell>
            <TableHeaderCell>Email</TableHeaderCell>
            <TableHeaderCell>Rôle</TableHeaderCell>
            <TableHeaderCell>Statut</TableHeaderCell>
            {canManage ? <TableHeaderCell>Actions</TableHeaderCell> : null}
          </TableRow>
        </TableHead>
        <TableBody>
          {members.map((member) =>
            canManage ? (
              <MemberRow key={member.id} member={member} currentUserId={currentUserId} onRequestRemove={setPendingRemoval} />
            ) : (
              <TableRow key={member.id}>
                <TableCell className="font-medium text-tenderos-navy">{member.user.displayName}</TableCell>
                <TableCell className="max-w-[160px] truncate text-tenderos-slate" title={member.user.email}>
                  {member.user.email}
                </TableCell>
                <TableCell className="text-tenderos-slate">{ORGANIZATION_ROLE_LABELS[member.role]}</TableCell>
                <TableCell>
                  <Badge tone={membershipStatusTone(member.status)}>{MEMBERSHIP_STATUS_LABELS[member.status]}</Badge>
                </TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>

      <Dialog
        open={pendingRemoval !== undefined}
        onClose={() => setPendingRemoval(undefined)}
        title="Retirer ce membre ?"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setPendingRemoval(undefined)}>
              Annuler
            </Button>
            <Button type="button" variant="danger" loading={isRemoving} onClick={confirmRemove}>
              Retirer
            </Button>
          </>
        }
      >
        <p>
          {pendingRemoval ? (
            <>
              <strong>{pendingRemoval.user.displayName}</strong> perdra immédiatement l&apos;accès à cette organisation. Cette action est réversible en le réinvitant, mais son
              accès en cours sera coupé sans délai.
            </>
          ) : null}
        </p>
        {removeError ? (
          <p role="alert" className="mt-2 text-xs text-danger-fg">
            {removeError}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
