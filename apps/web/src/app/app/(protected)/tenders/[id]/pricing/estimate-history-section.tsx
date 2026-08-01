"use client";

import { useState } from "react";
import { getPricingEstimateVersionAction } from "../../../../pricing-actions";
import {
  pricingStatusBadgeClass,
  PRICING_STATUS_LABELS,
  type PricingEstimateSummary,
} from "../../../../../../lib/pricing-types";
import { EstimateComparisonPanel } from "./estimate-comparison-panel";

function VersionDetail({ estimateId, version }: { estimateId: string; version: number }) {
  const [detail, setDetail] = useState<PricingEstimateSummary | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  async function toggle() {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
    if (detail) return;
    setIsLoading(true);
    setError(undefined);
    const result = await getPricingEstimateVersionAction(estimateId, version);
    setIsLoading(false);
    if (result.error) setError(result.error);
    else setDetail(result.estimate);
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={toggle} className="self-start text-sm text-neutral-700 underline">
        {isOpen ? "Masquer" : "Voir"} la version {version}
      </button>
      {isLoading ? <p className="text-xs text-neutral-500">Chargement...</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {isOpen && detail ? (
        <div className="flex flex-col gap-1 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <span className="font-medium text-neutral-900">
            {detail.currentVersion.amount} {detail.currentVersion.currency}
          </span>
          <table className="w-full text-xs">
            <tbody>
              {detail.currentVersion.breakdown.map((line) => (
                <tr key={line.type} className="border-t border-neutral-100">
                  <td className="py-1 text-neutral-700">{line.label}</td>
                  <td className="py-1 text-right text-neutral-900">
                    {line.amount} {line.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {detail.currentVersion.recalculationReason ? (
            <p className="text-xs text-neutral-600">Raison du recalcul : {detail.currentVersion.recalculationReason}</p>
          ) : null}
          <p className="text-xs text-neutral-500">{detail.currentVersion.disclaimerText}</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Mission Sprint 7 §"Historique" — liste TOUTES les estimations du Tender (actives et archivées),
 * jamais recalculées ici : chaque version consultée vient de `GET /pricing/estimates/:id?version=N`
 * (mission "ne recalcule jamais rétroactivement un coût historique").
 */
export function EstimateHistorySection({ estimates }: { estimates: PricingEstimateSummary[] }) {
  if (estimates.length === 0) {
    return <p className="text-sm text-neutral-600">Aucune estimation pour ce Tender pour l&apos;instant.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {estimates.map((estimate) => (
        <div key={estimate.id} className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-900">
              Estimation {estimate.id.slice(0, 8)} — {estimate.currentVersionNumber} version(s)
            </span>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${pricingStatusBadgeClass(estimate.status)}`}>
              {PRICING_STATUS_LABELS[estimate.status] ?? estimate.status}
            </span>
          </div>
          <p className="text-xs text-neutral-500">Créée le {new Date(estimate.createdAt).toLocaleString("fr-FR")}</p>
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: estimate.currentVersionNumber }, (_, index) => index + 1).map((version) => (
              <VersionDetail key={version} estimateId={estimate.id} version={version} />
            ))}
          </div>
          <EstimateComparisonPanel estimateId={estimate.id} />
        </div>
      ))}
    </div>
  );
}
