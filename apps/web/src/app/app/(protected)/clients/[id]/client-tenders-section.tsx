import Link from "next/link";
import { Button, Card } from "../../../../../components/ui";
import { TENDER_STATUS_LABELS, type TenderListItem } from "../../../../../lib/tenders-types";

export function ClientTendersSection({ clientId, tenders, hasMore }: { clientId: string; tenders: TenderListItem[]; hasMore: boolean }) {
  return (
    <Card
      title="Appels d'offres"
      actions={
        <Button variant="link" href={`/app/tenders?clientAccountId=${clientId}`} className="text-xs">
          Voir tous →
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {tenders.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun appel d&apos;offres pour ce client.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {tenders.map((tender) => (
              <li key={tender.id} className="flex items-center justify-between rounded-lg border border-tenderos-navy/10 px-3 py-2 text-sm">
                <Link href={`/app/tenders/${tender.id}`} className="font-medium text-tenderos-navy hover:underline">
                  {tender.title}
                </Link>
                <span className="text-xs text-tenderos-slate">{TENDER_STATUS_LABELS[tender.status]}</span>
              </li>
            ))}
          </ul>
        )}
        {hasMore ? <p className="text-xs text-tenderos-slate">D&apos;autres appels d&apos;offres existent pour ce client — voir la liste complète.</p> : null}
      </div>
    </Card>
  );
}
