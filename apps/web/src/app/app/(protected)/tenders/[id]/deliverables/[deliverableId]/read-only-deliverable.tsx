import { appApiFetch } from "../../../../../../../lib/app-api-client";
import type { DeliverableSummary } from "../../../../../../../lib/deliverable-types";
import { ApiErrorState } from "../../../../api-error-state";

type ValidationReport = {
  readiness: { status: string };
  latestRun?: { readinessStatus: string; controls?: unknown[] };
};
type DeliverableCostReportView = {
  estimate: {
    currentVersion: {
      version: number;
      amount: string;
      currency: string;
      status: string;
      disclaimerText: string;
      breakdown: { label: string; amount: string; currency: string }[];
    };
  };
  frozen: boolean;
  selection?: { pricingEstimateVersionNumber: number; selectedAt: string };
} | null;
type SignatureDocumentsView = {
  requirements: { id: string; documentKind: string; status: string }[];
  transactions: { transaction: { id: string; status: string } }[];
};
type SubmissionPackageSummary = {
  id: string;
  version: number;
  status: string;
  createdAt: string;
}[];

/** Mission Sprint 8A.1 §14 — 4 livrables PURS LECTURE SEULE, entièrement dérivés d'un autre module
 *  déjà validé — jamais une seconde écriture. Composant serveur : pas d'interactivité nécessaire. */
export async function ReadOnlyDeliverable({
  tenderId: _tenderId,
  deliverable,
}: {
  tenderId: string;
  deliverable: DeliverableSummary;
}) {
  try {
    if (deliverable.type === "VALIDATION_REPORT") {
      const report = await appApiFetch<ValidationReport>(
        `/api/v1/deliverables/${deliverable.id}/validation-report`,
      );
      return (
        <div className="rounded border border-tenderos-navy/10 p-4 text-sm">
          <p>
            Statut de préparation : <span className="font-semibold">{report.readiness.status}</span>
          </p>
          {report.latestRun ? (
            <p className="mt-2 text-tenderos-slate">
              Dernier contrôle : {report.latestRun.readinessStatus}
            </p>
          ) : (
            <p className="mt-2 text-tenderos-slate">
              Aucun contrôle de validation pour l&apos;instant.
            </p>
          )}
        </div>
      );
    }

    if (deliverable.type === "COST_REPORT") {
      const report = await appApiFetch<DeliverableCostReportView>(
        `/api/v1/deliverables/${deliverable.id}/cost-report`,
      );
      if (!report)
        return (
          <p className="text-sm text-tenderos-slate">
            Aucune estimation de coût pour l&apos;instant.
          </p>
        );
      const { estimate, frozen } = report;
      return (
        <div className="rounded border border-tenderos-navy/10 p-4 text-sm">
          <div className="mb-2 flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${frozen ? "bg-success-bg text-success-fg" : "bg-warning-bg text-warning-fg"}`}
            >
              {frozen
                ? `Version ${estimate.currentVersion.version} figée`
                : "Dernière estimation (non figée)"}
            </span>
          </div>
          <p className="text-lg font-semibold">
            {estimate.currentVersion.amount} {estimate.currentVersion.currency}
          </p>
          <table className="mt-3 w-full border-collapse text-sm">
            <tbody>
              {estimate.currentVersion.breakdown.map((line, i) => (
                <tr key={i} className="border-b border-tenderos-navy/10">
                  <td className="py-1 pr-4 text-tenderos-navy">{line.label}</td>
                  <td className="py-1 text-tenderos-slate">
                    {line.amount} {line.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs italic text-tenderos-slate">
            {estimate.currentVersion.disclaimerText}
          </p>
          {!frozen ? (
            <p className="mt-2 text-xs text-tenderos-slate">
              Ce rapport suivra automatiquement les recalculs tant qu&apos;aucune version n&apos;a
              été explicitement figée.
            </p>
          ) : null}
        </div>
      );
    }

    if (deliverable.type === "SIGNATURE_DOCUMENTS") {
      const view = await appApiFetch<SignatureDocumentsView>(
        `/api/v1/deliverables/${deliverable.id}/signature-documents`,
      );
      return (
        <div className="flex flex-col gap-4">
          <div className="rounded border border-tenderos-navy/10 p-4 text-sm">
            <h3 className="mb-2 font-semibold text-tenderos-navy">Exigences de signature</h3>
            {view.requirements.length === 0 ? (
              <p className="text-tenderos-slate">Aucune exigence.</p>
            ) : null}
            <ul className="flex flex-col gap-1">
              {view.requirements.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span>{r.documentKind}</span>
                  <span className="text-tenderos-slate">{r.status}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded border border-tenderos-navy/10 p-4 text-sm">
            <h3 className="mb-2 font-semibold text-tenderos-navy">Transactions de signature</h3>
            {view.transactions.length === 0 ? (
              <p className="text-tenderos-slate">Aucune transaction.</p>
            ) : null}
            <ul className="flex flex-col gap-1">
              {view.transactions.map((t) => (
                <li key={t.transaction.id} className="flex justify-between">
                  <span>{t.transaction.id.slice(0, 8)}…</span>
                  <span className="text-tenderos-slate">{t.transaction.status}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    }

    // SUBMISSION_PACKAGE
    const packages = await appApiFetch<SubmissionPackageSummary>(
      `/api/v1/deliverables/${deliverable.id}/submission-package`,
    );
    return (
      <div className="rounded border border-tenderos-navy/10 p-4 text-sm">
        {packages.length === 0 ? (
          <p className="text-tenderos-slate">Aucun package pour l&apos;instant.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {packages.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>Version {p.version}</span>
                <span className="text-tenderos-slate">{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  } catch (error) {
    return <ApiErrorState error={error} />;
  }
}
