import Link from "next/link";
import { TENDER_STATUS_LABELS, type TenderListItem } from "../../../../../lib/tenders-types";

export function ClientTendersSection({ clientId, tenders, hasMore }: { clientId: string; tenders: TenderListItem[]; hasMore: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Appels d&apos;offres</h2>
        <Link href={`/app/tenders?clientAccountId=${clientId}`} className="text-xs text-neutral-700 hover:underline">
          Voir tous →
        </Link>
      </div>

      {tenders.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun appel d&apos;offres pour ce client.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {tenders.map((tender) => (
            <li key={tender.id} className="flex items-center justify-between rounded border border-neutral-100 px-3 py-2 text-sm">
              <Link href={`/app/tenders/${tender.id}`} className="font-medium text-neutral-900 hover:underline">
                {tender.title}
              </Link>
              <span className="text-xs text-neutral-500">{TENDER_STATUS_LABELS[tender.status]}</span>
            </li>
          ))}
        </ul>
      )}
      {hasMore ? <p className="text-xs text-neutral-500">D&apos;autres appels d&apos;offres existent pour ce client — voir la liste complète.</p> : null}
    </div>
  );
}
