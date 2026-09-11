"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card } from "../../../../components/ui";
import { deadlineUrgencyClass, MARKET_TYPE_LABELS, marketTypeTone, MATCH_STATUS_TONE, scoreTone, SOURCE_LABELS, type SavedSearchMatchSummary } from "../../../../lib/market-watch-types";
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
    <Card padding="tight" interactive className={status === "IGNORED" ? "opacity-60" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/app/market-watch/${match.tender.id}`} className="text-sm font-semibold text-tenderos-navy hover:underline">
            {match.tender.title}
          </Link>
          <p className="mt-0.5 text-xs text-tenderos-slate">{match.tender.buyerName ?? "Acheteur non communiqué"}</p>
        </div>
        <span className="shrink-0">
          <Badge tone={scoreTone(match.score)}>Pertinence {match.score}%</Badge>
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Badge tone={marketTypeTone(match.tender.marketType)}>{MARKET_TYPE_LABELS[match.tender.marketType] ?? match.tender.marketType}</Badge>
        <Badge>{SOURCE_LABELS[match.tender.source] ?? match.tender.source}</Badge>
        {status !== "NEW" ? <Badge tone={MATCH_STATUS_TONE[status]}>{status === "INTERESTED" ? "Intéressé" : "Ignoré"}</Badge> : null}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-tenderos-slate sm:grid-cols-4">
        <div>Publié : {formatDate(match.tender.publicationDate)}</div>
        <div className={deadlineUrgencyClass(match.tender.submissionDeadline)}>Deadline : {formatDate(match.tender.submissionDeadline)}</div>
        <div>Montant : {formatAmount(match.tender.estimatedAmount, match.tender.currency)}</div>
        <div>{match.tender.city ?? match.tender.department ?? match.tender.region ?? match.tender.country ?? "—"}</div>
      </div>

      {match.matchReasons.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {match.matchReasons.map((reason) => (
            <span key={reason.criterion} className="rounded-full bg-tenderos-light px-2 py-0.5 text-xs font-medium text-tenderos-navy/70">
              {reason.matched ? "✓" : "•"} {reason.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={isPending} onClick={() => handleSetStatus("INTERESTED")}>
          ★ Favori
        </Button>
        <Button type="button" size="sm" disabled={isPending} onClick={() => handleSetStatus("IGNORED")}>
          Ignorer
        </Button>
        {match.tender.sourceUrl ? (
          // Lien externe (nouvel onglet) : `Button href` rend un `<Link>` interne sans `target` —
          // lien natif aux classes de `Button variant="secondary" size="sm"`.
          <a
            href={match.tender.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center justify-center rounded-lg border border-tenderos-navy/15 px-3 py-1.5 text-xs font-semibold text-tenderos-navy transition hover:bg-tenderos-light"
          >
            Voir la source
          </a>
        ) : null}
        {promoted ? (
          <span className="text-xs font-medium text-success-fg">Ajouté aux opportunités ✓</span>
        ) : (
          // `outline` et non `primary` : une carte par marché, donc jamais plusieurs boutons primaires à l'écran.
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => handlePromote()}>
            Ajouter à mes opportunités
          </Button>
        )}
      </div>

      {promoteError === "ALREADY_PROMOTED" ? (
        <Alert tone="warning" className="mt-2">
          Ce marché a déjà été ajouté à vos opportunités.{" "}
          <Button type="button" variant="link" onClick={() => handlePromote(true)}>
            Ajouter quand même
          </Button>
        </Alert>
      ) : promoteError ? (
        <p className="mt-2 text-xs text-danger-fg">{promoteError}</p>
      ) : null}
    </Card>
  );
}
