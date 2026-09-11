"use client";

import Link from "next/link";
import { useState } from "react";
import {
  createPricingScheduleAction,
  extractPricingScheduleVersionAction,
  fetchPricingSchedule,
  fetchPricingScheduleControls,
  generatePricingScheduleFinalFileAction,
  setPricingScheduleLineUnitPriceAction,
  validatePricingScheduleVersionAction,
} from "../../../../pricing-schedule-actions";
import {
  FINANCIAL_DOCUMENT_TYPE_LABELS,
  LINE_KIND_LABELS,
  PRICING_SCHEDULE_STATUS_LABELS,
  controlSeverityBadgeClass,
  lineStatusBadgeClass,
  pricingScheduleStatusBadgeClass,
  type PricingControlsResult,
  type PricingSchedule,
  type PricingScheduleLine,
  type PricingScheduleVersion,
} from "../../../../../../lib/pricing-schedule-types";
import type { DceDocumentSummary } from "../../../../../../lib/dce-types";
import { Button } from "../../../../../../components/ui/button";
import { Input } from "../../../../../../components/ui/input";
import { Alert } from "../../../../../../components/ui/alert";

type DetailState = {
  schedule: PricingSchedule;
  versions: PricingScheduleVersion[];
  lines: PricingScheduleLine[];
  controls: PricingControlsResult | undefined;
};

/** Fichier DCE catégorisé FINANCIAL n'ayant pas encore de chiffrage — mission §9 "pas de réimport
 *  obligatoire" : le bouton crée un `PricingSchedule` sur ce document DÉJÀ présent dans le DCE,
 *  jamais un second upload. */
function DetectedFileCard({
  tenderId,
  document,
  onCreated,
}: {
  tenderId: string;
  document: DceDocumentSummary;
  onCreated: (schedule: PricingSchedule) => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleCreate(): Promise<void> {
    setIsPending(true);
    setError(undefined);
    const result = await createPricingScheduleAction(tenderId, {
      sourceDocumentId: document.documentId,
    });
    setIsPending(false);
    if (result.error || !result.schedule) {
      setError(result.error ?? "La création du chiffrage a échoué.");
      return;
    }
    onCreated(result.schedule);
  }

  return (
    <div className="flex items-center justify-between rounded border border-tenderos-navy/10 p-3">
      <div>
        <div className="text-sm font-medium">{document.originalFilename}</div>
        <div className="text-xs text-tenderos-slate">
          Détecté dans le DCE — pas encore de chiffrage
        </div>
        {error ? <p className="mt-1 text-xs text-danger-fg">{error}</p> : null}
      </div>
      <Button type="button" onClick={handleCreate} disabled={isPending} variant="primary" size="sm">
        {isPending ? "Création…" : "Créer le chiffrage"}
      </Button>
    </div>
  );
}

function ControlsPanel({ controls }: { controls: PricingControlsResult | undefined }) {
  if (!controls) return null;
  if (controls.findings.length === 0) {
    return (
      <Alert tone="success">Aucune anomalie détectée sur cette version.</Alert>
    );
  }
  return (
    <div className="rounded border border-tenderos-navy/10 p-3">
      <h3 className="text-sm font-semibold">Contrôles</h3>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className={`rounded px-2 py-1 ${controlSeverityBadgeClass("ERROR")}`}>
          Erreurs : {controls.errorCount}
        </span>
        <span className={`rounded px-2 py-1 ${controlSeverityBadgeClass("WARNING")}`}>
          Avertissements : {controls.warningCount}
        </span>
        <span className={`rounded px-2 py-1 ${controlSeverityBadgeClass("INFO")}`}>
          Infos : {controls.infoCount}
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-1 text-xs text-tenderos-navy">
        {controls.findings.map((finding, index) => (
          <li
            key={`${finding.code}-${finding.pricingScheduleLineId ?? index}`}
            className="flex items-start gap-2"
          >
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 ${controlSeverityBadgeClass(finding.severity)}`}
            >
              {finding.severity}
            </span>
            <span>{finding.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LineRow({
  tenderId,
  scheduleId,
  line,
  editable,
  onUpdated,
}: {
  tenderId: string;
  scheduleId: string;
  line: PricingScheduleLine;
  editable: boolean;
  onUpdated: (line: PricingScheduleLine) => void;
}) {
  const [draftPrice, setDraftPrice] = useState(line.proposedUnitPrice ?? "");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (line.kind !== "PRICE_ITEM") {
    return (
      <tr className="border-t border-tenderos-navy/10 bg-tenderos-light">
        <td colSpan={6} className="px-3 py-2 text-xs font-medium text-tenderos-slate">
          {LINE_KIND_LABELS[line.kind]} —{" "}
          {line.designation || <span className="italic text-tenderos-slate">(sans libellé)</span>}
        </td>
      </tr>
    );
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setIsPending(true);
    setError(undefined);
    const result = await setPricingScheduleLineUnitPriceAction(
      tenderId,
      scheduleId,
      line.id,
      draftPrice,
    );
    setIsPending(false);
    if (result.error || !result.line) {
      setError(result.error ?? "La saisie du prix a échoué.");
      return;
    }
    onUpdated(result.line);
  }

  return (
    <tr className="border-t border-tenderos-navy/10">
      <td className="px-3 py-2 text-sm">{line.designation}</td>
      <td className="px-3 py-2 text-sm text-tenderos-slate">{line.unit ?? "—"}</td>
      <td className="px-3 py-2 text-sm text-tenderos-slate">{line.quantity ?? "—"}</td>
      <td className="px-3 py-2">
        {editable ? (
          <form onSubmit={handleSubmit} className="flex items-center gap-1">
            <Input
              type="text"
              inputMode="decimal"
              value={draftPrice}
              onChange={(event) => setDraftPrice(event.target.value)}
              className="w-24"
              aria-label={`Prix unitaire — ${line.designation}`}
            />
            <Button type="submit" disabled={isPending} variant="primary" size="sm">
              {isPending ? "…" : "OK"}
            </Button>
          </form>
        ) : (
          <span className="text-sm">{line.proposedUnitPrice ?? "—"}</span>
        )}
        {error ? <p className="mt-1 text-xs text-danger-fg">{error}</p> : null}
      </td>
      <td className="px-3 py-2 text-sm text-tenderos-slate">{line.proposedTotal ?? "—"}</td>
      <td className="px-3 py-2">
        <span className={`rounded px-2 py-0.5 text-xs ${lineStatusBadgeClass(line.status)}`}>
          {line.status}
        </span>
      </td>
    </tr>
  );
}

function ScheduleDetail({
  tenderId,
  detail,
  onRefresh,
}: {
  tenderId: string;
  detail: DetailState;
  onRefresh: () => Promise<void>;
}) {
  const { schedule, versions, lines, controls } = detail;
  const currentVersion = versions.find((v) => v.id === schedule.currentVersionId);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [justification, setJustification] = useState("");
  const [actionError, setActionError] = useState<string | undefined>();
  const [generatedDocumentId, setGeneratedDocumentId] = useState<string | undefined>();

  async function handleExtract(): Promise<void> {
    setIsExtracting(true);
    setActionError(undefined);
    const result = await extractPricingScheduleVersionAction(
      tenderId,
      schedule.id,
      schedule.sourceDocumentVersionId,
    );
    setIsExtracting(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    await onRefresh();
  }

  async function handleValidate(): Promise<void> {
    if (!currentVersion) return;
    setIsValidating(true);
    setActionError(undefined);
    const result = await validatePricingScheduleVersionAction(
      tenderId,
      schedule.id,
      currentVersion.id,
      justification || undefined,
    );
    setIsValidating(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setJustification("");
    await onRefresh();
  }

  async function handleGenerate(): Promise<void> {
    if (!currentVersion) return;
    setIsGenerating(true);
    setActionError(undefined);
    const result = await generatePricingScheduleFinalFileAction(
      tenderId,
      schedule.id,
      currentVersion.id,
    );
    setIsGenerating(false);
    if (result.error || !result.finalFile) {
      setActionError(result.error ?? "La génération du fichier final a échoué.");
      return;
    }
    setGeneratedDocumentId(result.finalFile.documentId);
    await onRefresh();
  }

  const isValidated = currentVersion?.status === "VALIDATED";
  const priceableCount = lines.filter((l) => l.kind === "PRICE_ITEM").length;
  const pricedCount = lines.filter((l) => l.kind === "PRICE_ITEM" && l.status === "PRICED").length;

  return (
    <div className="flex flex-col gap-4 rounded border border-tenderos-navy/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            {FINANCIAL_DOCUMENT_TYPE_LABELS[schedule.financialDocumentType]}
          </h3>
          <p className="text-xs text-tenderos-slate">
            {currentVersion
              ? `Version ${currentVersion.versionNumber}`
              : "Aucune extraction pour l'instant"}{" "}
            — {priceableCount > 0 ? `${pricedCount}/${priceableCount} lignes chiffrées` : "—"}
          </p>
        </div>
        <span
          className={`rounded px-2 py-1 text-xs ${pricingScheduleStatusBadgeClass(schedule.status)}`}
        >
          {PRICING_SCHEDULE_STATUS_LABELS[schedule.status]}
        </span>
      </div>

      {actionError ? (
        <Alert tone="danger">{actionError}</Alert>
      ) : null}

      {!currentVersion ? (
        <Button
          type="button"
          onClick={handleExtract}
          disabled={isExtracting}
          className="self-start"
          variant="primary"
          size="sm"
        >
          {isExtracting ? "Extraction en cours…" : "Extraire les lignes du classeur"}
        </Button>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="text-xs font-medium text-tenderos-slate">
                  <th className="px-3 py-2">Désignation</th>
                  <th className="px-3 py-2">Unité</th>
                  <th className="px-3 py-2">Quantité</th>
                  <th className="px-3 py-2">PU</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <LineRow
                    key={line.id}
                    tenderId={tenderId}
                    scheduleId={schedule.id}
                    line={line}
                    editable={!isValidated}
                    onUpdated={() => void onRefresh()}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <ControlsPanel controls={controls} />

          <div className="flex flex-wrap items-end gap-3 border-t border-tenderos-navy/10 pt-3">
            {!isValidated ? (
              <>
                {controls && controls.errorCount > 0 ? (
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`justification-${schedule.id}`}
                      className="text-xs font-medium text-tenderos-slate"
                    >
                      Justification (requise tant que des erreurs bloquantes subsistent)
                    </label>
                    <Input
                      id={`justification-${schedule.id}`}
                      type="text"
                      value={justification}
                      onChange={(event) => setJustification(event.target.value)}
                      className="w-72"
                    />
                  </div>
                ) : null}
                <Button
                  type="button"
                  onClick={handleValidate}
                  disabled={isValidating}
                  variant="primary"
                  size="sm"
                >
                  {isValidating ? "Validation…" : "Valider le chiffrage"}
                </Button>
              </>
            ) : (
              <>
                <span className="text-xs text-success-fg">
                  Version validée — immuable. Une nouvelle extraction créera une nouvelle version
                  pour tout changement de prix.
                </span>
                <Button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  variant="primary"
                  size="sm"
                >
                  {isGenerating ? "Génération…" : "Générer les fichiers financiers"}
                </Button>
                {generatedDocumentId ? (
                  <Link
                    href={`/app/documents/${generatedDocumentId}/download`}
                    className="text-sm font-medium text-tenderos-blue underline"
                  >
                    Télécharger le fichier généré
                  </Link>
                ) : null}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function PricingScheduleSection({
  tenderId,
  initialSchedules,
  detectedFinancialDocuments,
}: {
  tenderId: string;
  initialSchedules: PricingSchedule[];
  detectedFinancialDocuments: DceDocumentSummary[];
}) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | undefined>(
    initialSchedules[0]?.id,
  );
  const [detail, setDetail] = useState<DetailState | undefined>();
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const scheduledDocumentIds = new Set(schedules.map((s) => s.sourceDocumentId));
  const undetectedFiles = detectedFinancialDocuments.filter(
    (doc) => !scheduledDocumentIds.has(doc.documentId),
  );

  async function loadDetail(scheduleId: string): Promise<void> {
    setIsLoadingDetail(true);
    setSelectedScheduleId(scheduleId);
    const result = await fetchPricingSchedule(scheduleId);
    const currentVersion = result.versions.find((v) => v.id === result.schedule.currentVersionId);
    if (currentVersion) {
      const [{ lines }, controls] = await Promise.all([
        fetchPricingSchedule(scheduleId, currentVersion.id),
        fetchPricingScheduleControls(scheduleId, currentVersion.id).catch(() => undefined),
      ]);
      setDetail({ schedule: result.schedule, versions: result.versions, lines, controls });
    } else {
      setDetail({
        schedule: result.schedule,
        versions: result.versions,
        lines: [],
        controls: undefined,
      });
    }
    setIsLoadingDetail(false);
  }

  function handleScheduleCreated(schedule: PricingSchedule): void {
    setSchedules((prev) => [schedule, ...prev]);
    void loadDetail(schedule.id);
  }

  return (
    <div className="flex flex-col gap-6">
      {undetectedFiles.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Fichiers financiers détectés dans le DCE</h2>
          {undetectedFiles.map((doc) => (
            <DetectedFileCard
              key={doc.documentId}
              tenderId={tenderId}
              document={doc}
              onCreated={handleScheduleCreated}
            />
          ))}
        </div>
      ) : null}

      {schedules.length === 0 ? (
        <p className="rounded border border-tenderos-navy/10 p-4 text-sm text-tenderos-slate">
          Aucun fichier BPU/DPGF/DQE détecté pour l&apos;instant dans le DCE de cet appel
          d&apos;offres.
        </p>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex w-full flex-col gap-2 lg:w-64">
            <h2 className="text-sm font-semibold">Chiffrages</h2>
            {schedules.map((schedule) => (
              <Button
                key={schedule.id}
                type="button"
                onClick={() => void loadDetail(schedule.id)}
                className={`rounded border p-3 text-left text-sm ${selectedScheduleId === schedule.id ? "border-tenderos-navy bg-tenderos-light" : "border-tenderos-navy/10 hover:bg-tenderos-light"}`}
                variant="ghost"
                size="sm"
              >
                <div className="font-medium">
                  {FINANCIAL_DOCUMENT_TYPE_LABELS[schedule.financialDocumentType]}
                </div>
                <span
                  className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${pricingScheduleStatusBadgeClass(schedule.status)}`}
                >
                  {PRICING_SCHEDULE_STATUS_LABELS[schedule.status]}
                </span>
              </Button>
            ))}
          </div>
          <div className="flex-1">
            {isLoadingDetail ? (
              <p className="text-sm text-tenderos-slate">Chargement…</p>
            ) : detail && detail.schedule.id === selectedScheduleId ? (
              <ScheduleDetail
                tenderId={tenderId}
                detail={detail}
                onRefresh={() => loadDetail(detail.schedule.id)}
              />
            ) : (
              <p className="text-sm text-tenderos-slate">
                Sélectionnez un chiffrage pour afficher son détail.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
