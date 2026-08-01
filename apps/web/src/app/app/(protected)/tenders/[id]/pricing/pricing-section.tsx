"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  archivePricingEstimateAction,
  createPricingEstimateAction,
  previewGenerationCostAction,
  recalculatePricingEstimateAction,
} from "../../../../pricing-actions";
import {
  ESTIMATE_DISCLAIMER_TEXT,
  costDataStatusLabel,
  pricingStatusBadgeClass,
  PRICING_STATUS_LABELS,
  type CostAggregateSummary,
  type PreviewGenerationCostResult,
  type TenderCostSummary,
} from "../../../../../../lib/pricing-types";
import { EstimateComparisonPanel } from "./estimate-comparison-panel";

function canManagePricing(actorRole: string | undefined): boolean {
  // Vérification UI uniquement, jamais l'autorité — le backend revalide systématiquement via
  // AssertClientAccessUseCase (ManagePricing), mission §"Le frontend ne doit pas être la seule
  // barrière".
  return actorRole !== "READ_ONLY" && actorRole !== undefined;
}

function CostAggregateCard({ title, aggregate }: { title: string; aggregate: CostAggregateSummary }) {
  const currencies = Object.entries(aggregate.totalsByCurrency);
  return (
    <div className="flex flex-col gap-1 rounded border border-neutral-200 p-3">
      <span className="text-xs font-medium text-neutral-500">{title}</span>
      {currencies.length === 0 ? (
        <span className="text-sm text-neutral-500">Coût non disponible</span>
      ) : (
        currencies.map(([currency, amount]) => (
          <span key={currency} className="text-lg font-semibold text-neutral-900">
            {amount} {currency}
          </span>
        ))
      )}
      {aggregate.mixedCurrencies ? <p className="text-xs text-amber-700">Plusieurs devises détectées — totaux affichés séparément.</p> : null}
      <div className="flex gap-3 text-xs text-neutral-500">
        <span>{aggregate.calculatedCount} réel(s)</span>
        <span>{aggregate.partialCount} partiel(s)</span>
        <span>{aggregate.unknownCount} inconnu(s)</span>
      </div>
    </div>
  );
}

export function PricingSection({ tenderId, initialSummary, actorRole }: { tenderId: string; initialSummary: TenderCostSummary; actorRole: string | undefined }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [workHours, setWorkHours] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [additionalFeesAmount, setAdditionalFeesAmount] = useState("");
  const [recalcReason, setRecalcReason] = useState("");
  const [taskType, setTaskType] = useState("");
  const [estimatedGenerationsCount, setEstimatedGenerationsCount] = useState("");
  const [estimatedInputTokensPerGeneration, setEstimatedInputTokensPerGeneration] = useState("");
  const [estimatedOutputTokensPerGeneration, setEstimatedOutputTokensPerGeneration] = useState("");
  const [previewResult, setPreviewResult] = useState<PreviewGenerationCostResult | undefined>();
  const [previewError, setPreviewError] = useState<string | undefined>();
  const [isPreviewing, setIsPreviewing] = useState(false);

  const canManage = canManagePricing(actorRole);
  const estimate = initialSummary.activeEstimate;

  function buildAssumptions() {
    return {
      workHours: workHours ? Number(workHours) : undefined,
      hourlyRate: hourlyRate || undefined,
      headcount: headcount ? Number(headcount) : undefined,
      additionalFeesAmount: additionalFeesAmount || undefined,
      estimatedGenerationsCount: estimatedGenerationsCount ? Number(estimatedGenerationsCount) : undefined,
      estimatedInputTokensPerGeneration: estimatedInputTokensPerGeneration ? Number(estimatedInputTokensPerGeneration) : undefined,
      estimatedOutputTokensPerGeneration: estimatedOutputTokensPerGeneration ? Number(estimatedOutputTokensPerGeneration) : undefined,
    };
  }

  /** Mission Sprint 7 §"Preview avant création" — consultation seule (jamais persistée), même
   *  route backend que la génération réelle (`POST .../pricing/preview`), jamais un calcul fait
   *  côté frontend. */
  async function handlePreview() {
    if (!taskType) {
      setPreviewError("Le type de tâche IA est requis pour prévisualiser le coût IA.");
      return;
    }
    setIsPreviewing(true);
    setPreviewError(undefined);
    const result = await previewGenerationCostAction(tenderId, {
      taskType,
      ...(estimatedGenerationsCount ? { estimatedGenerationsCount: Number(estimatedGenerationsCount) } : {}),
      ...(estimatedInputTokensPerGeneration ? { estimatedInputTokensPerGeneration: Number(estimatedInputTokensPerGeneration) } : {}),
      ...(estimatedOutputTokensPerGeneration ? { estimatedOutputTokensPerGeneration: Number(estimatedOutputTokensPerGeneration) } : {}),
    });
    setIsPreviewing(false);
    if (result.error) setPreviewError(result.error);
    else setPreviewResult(result.result);
  }

  async function handleCreate() {
    setIsPending(true);
    setError(undefined);
    const result = await createPricingEstimateAction(tenderId, taskType || undefined, buildAssumptions());
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setIsCreating(false);
      router.refresh();
    }
  }

  async function handleRecalculate() {
    if (!estimate) return;
    setIsPending(true);
    setError(undefined);
    const result = await recalculatePricingEstimateAction(tenderId, estimate.id, undefined, buildAssumptions(), recalcReason);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setIsRecalculating(false);
      router.refresh();
    }
  }

  async function handleArchive() {
    if (!estimate) return;
    setIsPending(true);
    setError(undefined);
    const result = await archivePricingEstimateAction(tenderId, estimate.id);
    setIsPending(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CostAggregateCard title="Coût IA réel (Tender)" aggregate={initialSummary.technicalCost} />
        {Object.entries(initialSummary.byTaskType).map(([taskType, aggregate]) => (
          <CostAggregateCard key={taskType} title={`Coût IA réel — ${taskType}`} aggregate={aggregate} />
        ))}
      </div>

      <p role="note" className="rounded border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
        {ESTIMATE_DISCLAIMER_TEXT}
      </p>

      {estimate ? (
        <div className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Estimation active (v{estimate.currentVersionNumber})</h2>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${pricingStatusBadgeClass(estimate.status)}`}>
              {PRICING_STATUS_LABELS[estimate.status] ?? estimate.status}
            </span>
          </div>
          <p className="text-2xl font-semibold text-neutral-900">
            {estimate.currentVersion.amount} {estimate.currentVersion.currency}
            <span className="ml-2 text-xs font-normal text-neutral-500">Prévision indicative</span>
          </p>
          <table className="w-full text-sm">
            <tbody>
              {estimate.currentVersion.breakdown.map((line) => (
                <tr key={line.type} className="border-t border-neutral-100">
                  <td className="py-1 text-neutral-700">{line.label}</td>
                  <td className="py-1 text-right text-neutral-900">
                    {line.amount} {line.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-neutral-500">{estimate.currentVersion.disclaimerText}</p>

          <EstimateComparisonPanel estimateId={estimate.id} />

          {canManage && estimate.status !== "ARCHIVED" ? (
            <div className="flex flex-wrap gap-2">
              {!isRecalculating ? (
                <button type="button" onClick={() => setIsRecalculating(true)} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700">
                  Recalculer
                </button>
              ) : null}
              <button
                type="button"
                disabled={isPending}
                onClick={handleArchive}
                className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
              >
                Archiver
              </button>
            </div>
          ) : null}

          {isRecalculating ? (
            <div className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
              <label htmlFor="recalc-reason" className="text-sm font-medium text-neutral-700">
                Raison du recalcul *
              </label>
              <input id="recalc-reason" value={recalcReason} onChange={(e) => setRecalcReason(e.target.value)} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button type="button" disabled={isPending} onClick={handleRecalculate} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                  Confirmer le recalcul
                </button>
                <button type="button" onClick={() => setIsRecalculating(false)} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700">
                  Annuler
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : canManage ? (
        <div className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold text-neutral-900">Créer une estimation prévisionnelle</h2>
          {!isCreating ? (
            <button type="button" onClick={() => setIsCreating(true)} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
              Nouvelle estimation
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <label htmlFor="task-type" className="text-sm font-medium text-neutral-700">
                Type de tâche IA (pour le coût IA prévisionnel)
              </label>
              <input id="task-type" value={taskType} onChange={(e) => setTaskType(e.target.value)} placeholder="EXECUTIVE_SUMMARY" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
              <label htmlFor="est-generations" className="text-sm font-medium text-neutral-700">
                Nombre de générations estimées
              </label>
              <input
                id="est-generations"
                type="number"
                min="0"
                value={estimatedGenerationsCount}
                onChange={(e) => setEstimatedGenerationsCount(e.target.value)}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <label htmlFor="est-input-tokens" className="text-sm font-medium text-neutral-700">
                Tokens d&apos;entrée estimés (par génération)
              </label>
              <input
                id="est-input-tokens"
                type="number"
                min="0"
                value={estimatedInputTokensPerGeneration}
                onChange={(e) => setEstimatedInputTokensPerGeneration(e.target.value)}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <label htmlFor="est-output-tokens" className="text-sm font-medium text-neutral-700">
                Tokens de sortie estimés (par génération)
              </label>
              <input
                id="est-output-tokens"
                type="number"
                min="0"
                value={estimatedOutputTokensPerGeneration}
                onChange={(e) => setEstimatedOutputTokensPerGeneration(e.target.value)}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button type="button" disabled={isPreviewing} onClick={handlePreview} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50">
                  {isPreviewing ? "Prévisualisation..." : "Prévisualiser"}
                </button>
              </div>
              {previewError ? (
                <p role="alert" className="text-sm text-red-600">
                  {previewError}
                </p>
              ) : null}
              {previewResult ? (
                <div className="flex flex-col gap-1 rounded border border-neutral-200 bg-neutral-50 p-3">
                  <span className="text-xs font-medium text-neutral-500">Aperçu (non enregistré)</span>
                  {previewResult.amount ? (
                    <span className="text-lg font-semibold text-neutral-900">
                      {previewResult.amount} {previewResult.currency}
                    </span>
                  ) : (
                    <span className="text-sm text-neutral-500">Coût non disponible</span>
                  )}
                  <span className="text-xs text-neutral-600">{costDataStatusLabel(previewResult.status)}</span>
                  <p className="text-xs text-neutral-500">{previewResult.disclaimerText}</p>
                </div>
              ) : null}

              <label htmlFor="work-hours" className="text-sm font-medium text-neutral-700">
                Temps de préparation (heures)
              </label>
              <input id="work-hours" type="number" min="0" value={workHours} onChange={(e) => setWorkHours(e.target.value)} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
              <label htmlFor="hourly-rate" className="text-sm font-medium text-neutral-700">
                Taux horaire (€)
              </label>
              <input id="hourly-rate" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
              <label htmlFor="headcount" className="text-sm font-medium text-neutral-700">
                Nombre de personnes
              </label>
              <input id="headcount" type="number" min="0" value={headcount} onChange={(e) => setHeadcount(e.target.value)} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
              <label htmlFor="fees" className="text-sm font-medium text-neutral-700">
                Frais additionnels (€)
              </label>
              <input id="fees" value={additionalFeesAmount} onChange={(e) => setAdditionalFeesAmount(e.target.value)} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
              <p className="text-xs text-neutral-500">{ESTIMATE_DISCLAIMER_TEXT}</p>
              <div className="flex gap-2">
                <button type="button" disabled={isPending} onClick={handleCreate} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                  {isPending ? "Calcul..." : "Calculer et enregistrer"}
                </button>
                <button type="button" onClick={() => setIsCreating(false)} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700">
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-neutral-600">Aucune estimation active pour ce Tender.</p>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
