"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deadlineUrgencyClass, marketTypeBadgeClass, matchStatusBadgeClass, MARKET_TYPE_LABELS, scoreBadgeClass, SOURCE_LABELS, type SavedSearchMatchSummary } from "../../../../lib/market-watch-types";
import { promoteExternalTenderAction, setMatchStatusAction } from "../../market-watch-actions";

function formatDate(value: string | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function formatAmount(value: number | undefined, currency: string | undefined): string {
  if (value === undefined) return "Non communiqué";
  return `${new Intl.NumberFormat("fr-FR").format(value)} ${currency ?? "EUR"}`;
}

/** Mission §91/§92/§94 — carte marché : infos essentielles + pourquoi ce match + actions. */
export function MatchCard({ match, savedSearchId }: { match: SavedSearchMatchSummary; savedSearchId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(match.status);
  const [isPending, startTransition] = useTransition();
  const [promoteError, setPromoteError] = useState<string | undefined>();
  const [promoted, setPromoted] = useState<string | undefined>();

  function handleSetStatus(newStatus: "INTERESTED" | "IGNORED") {
    setStatus(newStatus);
    startTransition(async () => {
      await setMatchStatusAction(savedSearchId, match.id, newStatus);
      router.refresh();
    });
  }

  function handlePromote(confirmDuplicate?: boolean) {
    setPromoteError(undefined);
    startTransition(async () => {
      const result = await promoteExternalTenderAction(match.tender.id, undefined, confirmDuplicate);
      if (result.error === "ALREADY_PROMOTED") {
        setPromoteError("ALREADY_PROMOTED");
        return;
      }
      if (result.error) {
        setPromoteError(result.error);
        return;
      }
      setPromoted(result.opportunityId);
    });
  }

  return (
    <div className={`rounded border border-neutral-200 p-4 ${status === "IGNORED" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/app/market-watch/${match.tender.id}`} className="text-sm font-semibold text-neutral-900 hover:underline">
            {match.tender.title}
          </Link>
          <p className="mt-0.5 text-xs text-neutral-500">{match.tender.buyerName ?? "Acheteur non communiqué"}</p>
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${scoreBadgeClass(match.score)}`}>Pertinence {match.score}%</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className={`rounded px-2 py-0.5 font-medium ${marketTypeBadgeClass(match.tender.marketType)}`}>{MARKET_TYPE_LABELS[match.tender.marketType] ?? match.tender.marketType}</span>
        <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium text-neutral-700">{SOURCE_LABELS[match.tender.source] ?? match.tender.source}</span>
        {status !== "NEW" ? <span className={`rounded px-2 py-0.5 font-medium ${matchStatusBadgeClass(status)}`}>{status === "INTERESTED" ? "Intéressé" : "Ignoré"}</span> : null}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-600 sm:grid-cols-4">
        <div>Publié : {formatDate(match.tender.publicationDate)}</div>
        <div className={deadlineUrgencyClass(match.tender.submissionDeadline)}>Deadline : {formatDate(match.tender.submissionDeadline)}</div>
        <div>Montant : {formatAmount(match.tender.estimatedAmount, match.tender.currency)}</div>
        <div>{match.tender.city ?? match.tender.department ?? match.tender.region ?? match.tender.country ?? "—"}</div>
      </div>

      {match.matchReasons.length > 0 ? (
        <p className="mt-2 text-xs text-neutral-500">
          {match.matchReasons.map((reason) => (
            <span key={reason.criterion} className="mr-2">
              {reason.matched ? "✓" : "•"} {reason.label}
            </span>
          ))}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={isPending} onClick={() => handleSetStatus("INTERESTED")} className="rounded border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50">
          ★ Favori
        </button>
        <button type="button" disabled={isPending} onClick={() => handleSetStatus("IGNORED")} className="rounded border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50">
          Ignorer
        </button>
        {match.tender.sourceUrl ? (
          <a href={match.tender.sourceUrl} target="_blank" rel="noreferrer noopener" className="rounded border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50">
            Voir la source
          </a>
        ) : null}
        {promoted ? (
          <span className="text-xs font-medium text-green-700">Ajouté aux opportunités ✓</span>
        ) : (
          <button type="button" disabled={isPending} onClick={() => handlePromote()} className="rounded bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
            Ajouter à mes opportunités
          </button>
        )}
      </div>

      {promoteError === "ALREADY_PROMOTED" ? (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          Ce marché a déjà été ajouté à vos opportunités.{" "}
          <button type="button" onClick={() => handlePromote(true)} className="font-medium underline">
            Ajouter quand même
          </button>
        </div>
      ) : promoteError ? (
        <p className="mt-2 text-xs text-red-600">{promoteError}</p>
      ) : null}
    </div>
  );
}
