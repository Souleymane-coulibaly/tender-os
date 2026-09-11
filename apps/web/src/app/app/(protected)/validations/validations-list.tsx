"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, Input, type BadgeTone } from "../../../../components/ui";
import { approveApprovalAction, rejectApprovalAction, requestApprovalChangesAction } from "../../workspace-actions";
import { APPROVAL_ENTITY_TYPE_LABELS, APPROVAL_STATUS_LABELS, type ApprovalRequest, type ApprovalStatus } from "../../../../lib/workspace-types";

/**
 * Design System — remplace l'ancien `statusBadgeClass()` local (classes de badge écrites à la main)
 * par une table STATUT → tone consommée par `Badge`. Mêmes couleurs sémantiques qu'avant.
 */
const APPROVAL_STATUS_TONE: Record<ApprovalStatus, BadgeTone> = {
  PENDING: "info",
  APPROVED: "success",
  REJECTED: "danger",
  CHANGES_REQUESTED: "warning",
  CANCELLED: "neutral",
};

function ValidationRow({ approval }: { approval: ApprovalRequest }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <li className="flex flex-col gap-2 px-4 py-3 text-sm">
      {/* En-tête de ligne dépliable (pleine largeur, contenu à gauche) : pas un `Button`, dont le
          style centré d'action ne convient pas à une ligne de liste. */}
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex flex-wrap items-center justify-between gap-2 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{APPROVAL_ENTITY_TYPE_LABELS[approval.entityType]}</Badge>
          <Badge tone={APPROVAL_STATUS_TONE[approval.status] ?? "info"}>{APPROVAL_STATUS_LABELS[approval.status]}</Badge>
          <span className="text-xs text-tenderos-slate">Demandé le {new Date(approval.requestedAt).toLocaleDateString("fr-FR")}</span>
        </div>
        <Link href={`/app/tenders/${approval.tenderId}/workspace`} className="text-xs font-medium text-tenderos-blue underline" onClick={(event) => event.stopPropagation()}>
          Ouvrir le Tender
        </Link>
      </button>

      {open ? (
        <div className="flex flex-col gap-2 border-t border-tenderos-navy/10 pt-2">
          {approval.comment ? <p className="text-xs italic text-tenderos-slate">{approval.comment}</p> : null}
          {error ? (
            <p role="alert" className="text-xs text-danger-fg">
              {error}
            </p>
          ) : null}
          {approval.status === "PENDING" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isPending}
                onClick={async () => {
                  setIsPending(true);
                  const result = await approveApprovalAction(approval.tenderId, approval.id);
                  setIsPending(false);
                  setError(result.error);
                  if (!result.error) router.refresh();
                }}
              >
                Approuver
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={async () => {
                  setIsPending(true);
                  const result = await requestApprovalChangesAction(approval.tenderId, approval.id);
                  setIsPending(false);
                  setError(result.error);
                  if (!result.error) router.refresh();
                }}
              >
                Demander des modifications
              </Button>
              {showReject ? (
                <>
                  <Input
                    aria-label="Raison du rejet"
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    placeholder="Raison du rejet (obligatoire)"
                    className="min-w-[12rem] flex-1 border-danger-fg"
                  />
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={isPending || rejectReason.trim().length === 0}
                    onClick={async () => {
                      setIsPending(true);
                      const result = await rejectApprovalAction(approval.tenderId, approval.id, rejectReason);
                      setIsPending(false);
                      setError(result.error);
                      if (!result.error) {
                        setShowReject(false);
                        setRejectReason("");
                        router.refresh();
                      }
                    }}
                  >
                    Confirmer le rejet
                  </Button>
                </>
              ) : (
                <Button type="button" variant="danger" size="sm" disabled={isPending} onClick={() => setShowReject(true)}>
                  Rejeter
                </Button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function ValidationsList({ initialApprovals }: { initialApprovals: ApprovalRequest[] }) {
  if (initialApprovals.length === 0) {
    return <EmptyState title="Aucune demande de validation ne correspond à ce filtre." />;
  }

  return (
    <Card padding="none">
      <ul className="divide-y divide-tenderos-navy/10">
        {initialApprovals.map((approval) => (
          <ValidationRow key={approval.id} approval={approval} />
        ))}
      </ul>
    </Card>
  );
}
