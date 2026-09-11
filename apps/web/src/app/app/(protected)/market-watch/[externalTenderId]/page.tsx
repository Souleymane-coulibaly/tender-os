import type { Metadata } from "next";
import { Badge, Card, PageHeader } from "../../../../../components/ui";
import { MARKET_TYPE_LABELS, marketTypeTone, SOURCE_LABELS } from "../../../../../lib/market-watch-types";
import { fetchExternalTender } from "../../../market-watch-actions";
import { ApiErrorState } from "../../api-error-state";
import { PromoteButton } from "./promote-button";

export const metadata: Metadata = { title: "Détail du marché — TenderOS" };

function formatDate(value: string | undefined): string {
  if (!value) return "Non communiquée";
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
function formatAmount(value: number | undefined, currency: string | undefined): string {
  if (value === undefined) return "Non communiqué";
  return `${new Intl.NumberFormat("fr-FR").format(value)} ${currency ?? "EUR"}`;
}

export default async function ExternalTenderDetailPage({ params }: { params: Promise<{ externalTenderId: string }> }) {
  const { externalTenderId } = await params;

  let tender;
  try {
    tender = await fetchExternalTender(externalTenderId);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Veille", href: "/app/market-watch" }, { label: tender.title }]}
        title={tender.title}
        description={tender.buyerName ?? "Acheteur non communiqué"}
        status={
          <>
            <Badge tone={marketTypeTone(tender.marketType)}>{MARKET_TYPE_LABELS[tender.marketType] ?? tender.marketType}</Badge>
            <Badge>{SOURCE_LABELS[tender.source] ?? tender.source}</Badge>
          </>
        }
        actions={
          <>
            {tender.sourceUrl ? (
              // Lien externe (nouvel onglet) : `Button href` rend un `<Link>` interne sans `target` —
              // lien natif aux classes de `Button variant="secondary"`.
              <a
                href={tender.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center justify-center rounded-lg border border-tenderos-navy/15 px-4 py-2 text-sm font-semibold text-tenderos-navy transition hover:bg-tenderos-light"
              >
                Voir la source officielle
              </a>
            ) : null}
            <PromoteButton externalTenderId={tender.id} />
          </>
        }
      />

      {tender.description ? (
        <Card>
          <p className="max-w-3xl whitespace-pre-line text-sm text-tenderos-navy">{tender.description}</p>
        </Card>
      ) : null}

      <Card>
        <dl className="grid grid-cols-2 gap-4 text-sm text-tenderos-navy sm:grid-cols-3">
          <div>
            <dt className="text-xs text-tenderos-slate">Publication</dt>
            <dd>{formatDate(tender.publicationDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-tenderos-slate">Deadline</dt>
            <dd>{formatDate(tender.submissionDeadline)}</dd>
          </div>
          <div>
            <dt className="text-xs text-tenderos-slate">Montant estimé</dt>
            <dd>{formatAmount(tender.estimatedAmount, tender.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-tenderos-slate">Zone</dt>
            <dd>{tender.city ?? tender.department ?? tender.region ?? tender.country ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-tenderos-slate">Procédure</dt>
            <dd>{tender.procedureType ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-tenderos-slate">CPV</dt>
            <dd>{tender.cpvCodes.length > 0 ? tender.cpvCodes.join(", ") : "—"}</dd>
          </div>
        </dl>
      </Card>

      {tender.lots && tender.lots.length > 0 ? (
        <Card title="Lots">
          <ul className="flex flex-col gap-1">
            {tender.lots.map((lot) => (
              <li key={lot.number} className="rounded-lg border border-tenderos-navy/10 p-2 text-sm">
                <span className="font-medium text-tenderos-navy">Lot {lot.number}</span>
                {lot.description ? <span className="text-tenderos-slate"> — {lot.description}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
