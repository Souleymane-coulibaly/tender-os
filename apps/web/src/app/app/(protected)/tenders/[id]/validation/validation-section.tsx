"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  approveFinalVersionAction,
  reopenFinalVersionAction,
  reopenValidationIssueAction,
  resolveValidationIssueAction,
  runFinalValidationAction,
} from "../../../../validation-actions";
import {
  READINESS_STATUS_LABELS,
  VALIDATION_FRESHNESS_LABELS,
  VALIDATION_RESOLUTION_STATUS_LABELS,
  VALIDATION_SEVERITY_LABELS,
  canApproveValidation,
  canManageValidation,
  readinessStatusBadgeClass,
  validationFreshnessBadgeClass,
  validationSeverityBadgeClass,
  type ReadinessStatusResult,
  type ValidationFreshnessResult,
  type ValidationIssueSummary,
  type ValidationRunSummary,
} from "../../../../../../lib/validation-types";
import type { ExportJobSummary } from "../../../../../../lib/export-types";
import { Button } from "../../../../../../components/ui/button";
import { Input } from "../../../../../../components/ui/input";
import { Select } from "../../../../../../components/ui/select";

function IssueRow({ tenderId, issue }: { tenderId: string; issue: ValidationIssueSummary }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const isOpen = issue.resolutionStatus === "OPEN" || issue.resolutionStatus === "REOPENED";

  async function handleSubmit(kind: "resolve" | "reopen") {
    if (!note.trim()) {
      setError("Une justification est requise.");
      return;
    }
    setIsPending(true);
    setError(undefined);
    const result =
      kind === "resolve"
        ? await resolveValidationIssueAction(tenderId, issue.id, note)
        : await reopenValidationIssueAction(tenderId, issue.id, note);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setNote("");
      router.refresh();
    }
  }

  return (
    <div className="rounded border border-tenderos-navy/10 p-3">
      <div className="mb-1 flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${validationSeverityBadgeClass(issue.severity)}`}
        >
          {VALIDATION_SEVERITY_LABELS[issue.severity] ?? issue.severity}
        </span>
        <span className="rounded bg-tenderos-light px-2 py-0.5 text-xs text-tenderos-slate">
          {VALIDATION_RESOLUTION_STATUS_LABELS[issue.resolutionStatus] ?? issue.resolutionStatus}
        </span>
        <span className="text-xs text-tenderos-slate">{issue.ruleCode}</span>
      </div>
      <p className="text-sm text-tenderos-navy">{issue.message}</p>
      {issue.recommendation ? (
        <p className="mt-1 text-xs text-tenderos-slate">{issue.recommendation}</p>
      ) : null}
      {issue.resolutionNote ? (
        <p className="mt-1 text-xs text-tenderos-slate">Note : {issue.resolutionNote}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Justification"
          className="min-w-[200px] flex-1"
        />
        {isOpen ? (
          <Button
            type="button"
            disabled={isPending}
            onClick={() => handleSubmit("resolve")}
            variant="secondary"
            size="sm"
          >
            Résoudre
          </Button>
        ) : (
          <Button
            type="button"
            disabled={isPending}
            onClick={() => handleSubmit("reopen")}
            variant="ghost"
            size="sm"
          >
            Rouvrir
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-sm text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ValidationSection({
  tenderId,
  readiness,
  run,
  completedPreviews,
  actorRole,
  freshness,
}: {
  tenderId: string;
  readiness: ReadinessStatusResult;
  run: ValidationRunSummary | undefined;
  completedPreviews: ExportJobSummary[];
  actorRole: string | undefined;
  freshness?: ValidationFreshnessResult | null;
}) {
  const router = useRouter();
  const canManage = canManageValidation(actorRole);
  const canApprove = canApproveValidation(actorRole);
  const [selectedExportJobId, setSelectedExportJobId] = useState(completedPreviews[0]?.id ?? "");
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | undefined>();
  const [comment, setComment] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | undefined>();

  const blockingOpen =
    run?.issues.some(
      (i) =>
        i.severity === "BLOCKING" &&
        (i.resolutionStatus === "OPEN" || i.resolutionStatus === "REOPENED"),
    ) ?? false;
  // Mission Sprint 8A.2 (correction bug #5/#9) — une fois approuvé, `readiness.status` progresse
  // au-delà de "APPROVED" (READY_FOR_SIGNATURE/SIGNATURE_IN_PROGRESS/PARTIALLY_SIGNED/
  // READY_FOR_SUBMISSION/BLOCKED) à mesure que la signature avance : `activeApprovalId` reste le
  // seul signal fiable "une approbation active existe déjà", jamais une comparaison de statut
  // littérale qui redeviendrait vraie par erreur dès que le statut progresse après approbation.
  const isAlreadyApproved = readiness.activeApprovalId !== undefined;
  const canApproveNow = run !== undefined && !blockingOpen && !isAlreadyApproved;

  async function handleRun() {
    if (!selectedExportJobId) return;
    setIsRunning(true);
    setRunError(undefined);
    const result = await runFinalValidationAction(tenderId, selectedExportJobId);
    setIsRunning(false);
    if (result.error) setRunError(result.error);
    else router.refresh();
  }

  async function handleApprove() {
    if (!run) return;
    setIsApproving(true);
    setApproveError(undefined);
    const result = await approveFinalVersionAction(tenderId, run.id, comment || undefined);
    setIsApproving(false);
    if (result.error) setApproveError(result.error);
    else router.refresh();
  }

  async function handleReopen() {
    if (!reopenReason.trim()) {
      setApproveError("Une raison est requise pour rouvrir.");
      return;
    }
    setIsApproving(true);
    setApproveError(undefined);
    const result = await reopenFinalVersionAction(tenderId, reopenReason);
    setIsApproving(false);
    if (result.error) setApproveError(result.error);
    else {
      setReopenReason("");
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-center gap-3 rounded border border-tenderos-navy/10 p-4">
        <span className="text-sm font-medium text-tenderos-navy">Statut de préparation :</span>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${readinessStatusBadgeClass(readiness.status)}`}
        >
          {READINESS_STATUS_LABELS[readiness.status] ?? readiness.status}
        </span>
        {freshness && freshness.hasActiveApproval ? (
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${validationFreshnessBadgeClass(freshness.freshness)}`}
            title="Fraîcheur de la dernière approbation par rapport au dossier courant (DCE/Analyse/Mémoire technique)"
          >
            {VALIDATION_FRESHNESS_LABELS[freshness.freshness]}
          </span>
        ) : null}
      </section>

      {canManage ? (
        <section className="flex flex-col gap-3 rounded border border-tenderos-navy/10 p-4">
          <h2 className="text-sm font-semibold text-tenderos-navy">
            Lancer un contrôle de validation
          </h2>
          {completedPreviews.length === 0 ? (
            <p className="text-sm text-tenderos-slate">
              Générez d&apos;abord un aperçu dans l&apos;onglet Export.
            </p>
          ) : (
            <>
              <Select
                value={selectedExportJobId}
                onChange={(e) => setSelectedExportJobId(e.target.value)}
                className="max-w-md"
              >
                {completedPreviews.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.documentType} v{job.version} —{" "}
                    {new Date(job.createdAt).toLocaleString("fr-FR")}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                disabled={isRunning}
                onClick={handleRun}
                className="self-start"
                variant="primary"
                size="sm"
              >
                {isRunning ? "Contrôle en cours..." : "Lancer la validation"}
              </Button>
            </>
          )}
          {runError ? (
            <p role="alert" className="text-sm text-danger-fg">
              {runError}
            </p>
          ) : null}
        </section>
      ) : null}

      {run ? (
        <section className="flex flex-col gap-3 rounded border border-tenderos-navy/10 p-4">
          <h2 className="text-sm font-semibold text-tenderos-navy">
            Contrôles ({run.issues.length})
          </h2>
          {run.issues.length === 0 ? (
            <p className="text-sm text-tenderos-slate">Aucun contrôle détecté.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {run.issues.map((issue) => (
                <IssueRow key={issue.id} tenderId={tenderId} issue={issue} />
              ))}
            </div>
          )}

          {canApprove ? (
            isAlreadyApproved ? (
              <div className="flex flex-col gap-2 rounded border border-tenderos-navy/10 bg-tenderos-light p-3">
                <label htmlFor="reopen-reason" className="text-sm font-medium text-tenderos-navy">
                  Rouvrir l&apos;approbation (raison requise)
                </label>
                <Input
                  id="reopen-reason"
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                />
                <Button
                  type="button"
                  disabled={isApproving}
                  onClick={handleReopen}
                  className="self-start"
                  variant="ghost"
                  size="sm"
                >
                  Rouvrir
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 rounded border border-tenderos-navy/10 bg-tenderos-light p-3">
                <label htmlFor="approve-comment" className="text-sm font-medium text-tenderos-navy">
                  Commentaire (facultatif)
                </label>
                <Input
                  id="approve-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <Button
                  type="button"
                  disabled={isApproving || !canApproveNow}
                  onClick={handleApprove}
                  className="self-start"
                  variant="primary"
                  size="sm"
                >
                  {isApproving ? "Approbation..." : "Approuver la version finale"}
                </Button>
                {blockingOpen ? (
                  <p className="text-xs text-danger-fg">
                    Des contrôles bloquants sont encore ouverts.
                  </p>
                ) : null}
              </div>
            )
          ) : null}

          {approveError ? (
            <p role="alert" className="text-sm text-danger-fg">
              {approveError}
            </p>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-tenderos-slate">
          Aucun contrôle de validation lancé pour l&apos;instant.
        </p>
      )}
    </div>
  );
}
