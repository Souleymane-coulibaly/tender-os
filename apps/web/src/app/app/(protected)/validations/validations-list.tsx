"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { approveApprovalAction, rejectApprovalAction, requestApprovalChangesAction } from "../../workspace-actions";
import { APPROVAL_ENTITY_TYPE_LABELS, APPROVAL_STATUS_LABELS, type ApprovalRequest } from "../../../../lib/workspace-types";

function statusBadgeClass(status: ApprovalRequest["status"]): string {
  switch (status) {
    case "APPROVED":
      return "bg-green-100 text-green-800";
    case "REJECTED":
      return "bg-red-100 text-red-800";
    case "CHANGES_REQUESTED":
      return "bg-amber-100 text-amber-800";
    case "CANCELLED":
      return "bg-neutral-200 text-neutral-500";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

function ValidationRow({ approval }: { approval: ApprovalRequest }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <li className="flex flex-col gap-2 rounded border border-neutral-200 p-3 text-sm">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex flex-wrap items-center justify-between gap-2 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">{APPROVAL_ENTITY_TYPE_LABELS[approval.entityType]}</span>
          <span className={`rounded px-1.5 py-0.5 text-xs ${statusBadgeClass(approval.status)}`}>{APPROVAL_STATUS_LABELS[approval.status]}</span>
          <span className="text-xs text-neutral-500">Demandé le {new Date(approval.requestedAt).toLocaleDateString("fr-FR")}</span>
        </div>
        <Link href={`/app/tenders/${approval.tenderId}/workspace`} className="text-xs font-medium text-blue-700 underline" onClick={(event) => event.stopPropagation()}>
          Ouvrir le Tender
        </Link>
      </button>

      {open ? (
        <div className="flex flex-col gap-2 border-t border-neutral-100 pt-2">
          {approval.comment ? <p className="text-xs italic text-neutral-600">{approval.comment}</p> : null}
          {error ? (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          ) : null}
          {approval.status === "PENDING" ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={async () => {
                  setIsPending(true);
                  const result = await approveApprovalAction(approval.tenderId, approval.id);
                  setIsPending(false);
                  setError(result.error);
                  if (!result.error) router.refresh();
                }}
                className="rounded border border-green-300 bg-green-50 px-2 py-1 text-xs text-green-800 hover:bg-green-100 disabled:opacity-50"
              >
                Approuver
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={async () => {
                  setIsPending(true);
                  const result = await requestApprovalChangesAction(approval.tenderId, approval.id);
                  setIsPending(false);
                  setError(result.error);
                  if (!result.error) router.refresh();
                }}
                className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                Demander des modifications
              </button>
              {showReject ? (
                <>
                  <input
                    aria-label="Raison du rejet"
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    placeholder="Raison du rejet (obligatoire)"
                    className="rounded border border-red-300 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
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
                    className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800 hover:bg-red-100 disabled:opacity-50"
                  >
                    Confirmer le rejet
                  </button>
                </>
              ) : (
                <button type="button" disabled={isPending} onClick={() => setShowReject(true)} className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800 hover:bg-red-100">
                  Rejeter
                </button>
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
    return <p className="rounded border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">Aucune demande de validation ne correspond à ce filtre.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {initialApprovals.map((approval) => (
        <ValidationRow key={approval.id} approval={approval} />
      ))}
    </ul>
  );
}
