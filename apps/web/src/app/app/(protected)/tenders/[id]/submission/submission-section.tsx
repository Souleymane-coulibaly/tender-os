"use client";

import { useState } from "react";
import {
  cancelTenderSubmissionAction,
  confirmSubmissionReceiptAction,
  recordSubmissionRejectionAction,
  recordTenderSubmissionAction,
  replaceTenderSubmissionAction,
  uploadSubmissionProofAction,
  withdrawTenderSubmissionAction,
} from "../../../../submission-actions";
import Link from "next/link";
import {
  SUBMISSION_PLATFORM_LABELS,
  SUBMISSION_PROOF_TYPE_LABELS,
  SUBMISSION_REJECTION_CATEGORY_LABELS,
  SUBMISSION_READINESS_ACTION_LABELS,
  submissionReadinessActionRoute,
  TENDER_SUBMISSION_STATUS_LABELS,
  type TenderSubmissionCapabilities,
  type TenderSubmissionReadinessResult,
  type TenderSubmissionSummary,
} from "../../../../../../lib/submission-types";
import { Button } from "../../../../../../components/ui/button";
import { Input } from "../../../../../../components/ui/input";
import { Select } from "../../../../../../components/ui/select";
import { FileInput } from "../../../../../../components/ui/file-input";

const PLATFORM_REQUIRING_CUSTOM_NAME = new Set(["OTHER", "PLATEFORME_ACHETEUR"]);
const IN_FLIGHT_STATUSES = new Set(["SUBMISSION_IN_PROGRESS", "SUBMITTED", "RECEIPT_CONFIRMED"]);

function ErrorText({ error }: { error: string | undefined }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-xs text-danger-fg">
      {error}
    </p>
  );
}

function formatDateTime(value: string | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR");
}

function formatRemainingTime(ms: number | undefined): string | undefined {
  if (ms === undefined) return undefined;
  if (ms < 0) return "dépassée";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return `${days} j ${hours} h`;
}

// Checkpoint 2.1-P2.1-FIX-F — la case "Dossier complet" (mission §121-130) reflète l'agrégation
// backend `fileReadinessReasons`, jamais un calcul frontend : `dossierComplet` est dérivé
// uniquement de l'absence de raison BLOCKING dans ce que le backend a déjà classifié.
function FileReadinessSummary({
  tenderId,
  reasons,
}: {
  tenderId: string;
  reasons: TenderSubmissionReadinessResult["fileReadinessReasons"];
}) {
  const blocking = reasons.filter((r) => r.severity === "BLOCKING");
  const warning = reasons.filter((r) => r.severity === "WARNING");
  const dossierComplet = blocking.length === 0;

  return (
    <div className="flex flex-col gap-2 rounded border border-tenderos-navy/10 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">Dossier prêt au dépôt</span>
        <span
          className={`rounded px-2 py-1 text-xs font-medium ${dossierComplet ? "bg-success-bg text-success-fg" : "bg-danger-bg text-danger-fg"}`}
        >
          {dossierComplet ? "Dossier complet" : "Dossier non prêt"}
        </span>
      </div>
      {blocking.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-danger-fg">
          {blocking.map((reason) => (
            <li
              key={reason.code}
              className="flex flex-wrap items-center justify-between gap-2 rounded bg-danger-bg px-2 py-1"
            >
              <span>{reason.message}</span>
              {reason.action ? (
                <Link
                  href={submissionReadinessActionRoute(tenderId, reason.action)}
                  className="shrink-0 text-danger-fg underline"
                >
                  {SUBMISSION_READINESS_ACTION_LABELS[reason.action]}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {warning.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-warning-fg">
          {warning.map((reason) => (
            <li
              key={reason.code}
              className="flex flex-wrap items-center justify-between gap-2 rounded bg-warning-bg px-2 py-1"
            >
              <span>{reason.message}</span>
              {reason.action ? (
                <Link
                  href={submissionReadinessActionRoute(tenderId, reason.action)}
                  className="shrink-0 text-warning-fg underline"
                >
                  {SUBMISSION_READINESS_ACTION_LABELS[reason.action]}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ReadinessCard({
  tenderId,
  readiness,
}: {
  tenderId: string;
  readiness: TenderSubmissionReadinessResult;
}) {
  // Les messages déjà couverts par `fileReadinessReasons` (rendus par FileReadinessSummary
  // ci-dessus) ne sont pas dupliqués ici — seuls les blockers/warnings historiques (package,
  // signature, date limite) restent affichés dans cette liste générique.
  const fileReasonMessages = new Set(readiness.fileReadinessReasons.map((r) => r.message));
  const otherBlockers = readiness.blockers.filter((b) => !fileReasonMessages.has(b));
  const otherWarnings = readiness.warnings.filter((w) => !fileReasonMessages.has(w));

  return (
    <div className="flex flex-col gap-4">
      <FileReadinessSummary tenderId={tenderId} reasons={readiness.fileReadinessReasons} />
      <div className="flex flex-col gap-2 rounded border border-tenderos-navy/10 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">État de préparation</span>
          <span className="rounded bg-tenderos-light px-2 py-1 text-xs font-medium">
            {readiness.readinessStatus}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-tenderos-navy sm:grid-cols-4">
          <dt className="text-tenderos-slate">Package</dt>
          <dd>{readiness.packageId ? `v${readiness.packageVersion}` : "—"}</dd>
          <dt className="text-tenderos-slate">Hash (court)</dt>
          <dd className="truncate">
            {readiness.packageHash ? readiness.packageHash.slice(0, 12) : "—"}
          </dd>
          <dt className="text-tenderos-slate">Date limite</dt>
          <dd>{formatDateTime(readiness.deadline)}</dd>
          <dt className="text-tenderos-slate">Temps restant</dt>
          <dd>{formatRemainingTime(readiness.remainingTimeMs) ?? "—"}</dd>
        </dl>
        {otherBlockers.length > 0 ? (
          <ul className="list-disc pl-4 text-xs text-danger-fg">
            {otherBlockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        ) : null}
        {otherWarnings.length > 0 ? (
          <ul className="list-disc pl-4 text-xs text-warning-fg">
            {otherWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        {readiness.requiredActions.length > 0 ? (
          <p className="text-xs text-tenderos-slate">
            Prochaines actions : {readiness.requiredActions.join(" → ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function RecordSubmissionForm({
  tenderId,
  readiness,
  onRecorded,
}: {
  tenderId: string;
  readiness: TenderSubmissionReadinessResult;
  onRecorded: (submission: TenderSubmissionSummary) => void;
}) {
  const [platform, setPlatform] = useState("PLACE");
  const [customPlatformName, setCustomPlatformName] = useState("");
  const [submittedAt, setSubmittedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [platformReference, setPlatformReference] = useState("");
  const [receiptReference, setReceiptReference] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit() {
    if (!readiness.packageId) return;
    setIsPending(true);
    setError(undefined);
    const result = await recordTenderSubmissionAction(tenderId, {
      packageId: readiness.packageId,
      platform,
      customPlatformName: PLATFORM_REQUIRING_CUSTOM_NAME.has(platform)
        ? customPlatformName
        : undefined,
      submittedAt: new Date(submittedAt).toISOString(),
      platformReference: platformReference || undefined,
      receiptReference: receiptReference || undefined,
      notes: notes || undefined,
    });
    setIsPending(false);
    if (result.error) setError(result.error);
    else if (result.submission) onRecorded(result.submission);
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-tenderos-navy/10 p-4 text-sm">
      <span className="font-medium">Enregistrer un dépôt</span>
      <p className="text-xs text-tenderos-slate">
        Package : v{readiness.packageVersion} — hash {readiness.packageHash?.slice(0, 12)} (lecture
        seule).
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
          Plateforme
          <Select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            {Object.entries(SUBMISSION_PLATFORM_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        {PLATFORM_REQUIRING_CUSTOM_NAME.has(platform) ? (
          <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
            Nom de la plateforme
            <Input
              type="text"
              value={customPlatformName}
              onChange={(event) => setCustomPlatformName(event.target.value)}
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
          Date et heure du dépôt
          <Input
            type="datetime-local"
            value={submittedAt}
            onChange={(event) => setSubmittedAt(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
          Référence du dépôt
          <Input
            type="text"
            value={platformReference}
            onChange={(event) => setPlatformReference(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
          Référence du reçu
          <Input
            type="text"
            value={receiptReference}
            onChange={(event) => setReceiptReference(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
          Notes
          <Input type="text" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <Button
          type="button"
          disabled={isPending || !readiness.packageId}
          onClick={handleSubmit}
          variant="secondary"
          size="sm"
        >
          Enregistrer le dépôt
        </Button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

function ProofUploadForm({
  tenderId,
  submissionId,
  onUpdated,
}: {
  tenderId: string;
  submissionId: string;
  onUpdated: (submission: TenderSubmissionSummary) => void;
}) {
  const [proofType, setProofType] = useState("RECEIPT");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(formData: FormData) {
    setIsPending(true);
    setError(undefined);
    const result = await uploadSubmissionProofAction(tenderId, submissionId, proofType, formData);
    setIsPending(false);
    if (result.error) setError(result.error);
    else if (result.submission) onUpdated(result.submission);
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-end gap-2 text-xs">
      <label className="flex flex-col gap-1 text-tenderos-slate">
        Type de preuve
        <Select value={proofType} onChange={(event) => setProofType(event.target.value)}>
          {Object.entries(SUBMISSION_PROOF_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </label>
      <div className="flex flex-col gap-1 text-tenderos-slate">
        <span>Fichier</span>
        <FileInput name="file" required aria-label="Fichier de preuve" />
      </div>
      <Button type="submit" disabled={isPending} variant="secondary" size="sm">
        Ajouter la preuve
      </Button>
      <ErrorText error={error} />
    </form>
  );
}

function ActiveSubmissionCard({
  tenderId,
  submission,
  capabilities,
  onUpdated,
}: {
  tenderId: string;
  submission: TenderSubmissionSummary;
  capabilities: TenderSubmissionCapabilities;
  onUpdated: (submission: TenderSubmissionSummary) => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [receiptReference, setReceiptReference] = useState("");
  const [confirmWithoutEvidence, setConfirmWithoutEvidence] = useState(false);
  const [withdrawalReason, setWithdrawalReason] = useState("");
  const [rejectionCategory, setRejectionCategory] = useState("OTHER");
  const [rejectionDescription, setRejectionDescription] = useState("");

  async function run(
    action: () => Promise<{ error?: string; submission?: TenderSubmissionSummary }>,
  ) {
    setIsPending(true);
    setError(undefined);
    const result = await action();
    setIsPending(false);
    if (result.error) setError(result.error);
    else if (result.submission) onUpdated(result.submission);
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-tenderos-navy/10 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">Dépôt actif</span>
        <span className="rounded bg-tenderos-light px-2 py-1 text-xs font-medium">
          {TENDER_SUBMISSION_STATUS_LABELS[submission.status] ?? submission.status}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-tenderos-navy sm:grid-cols-4">
        <dt className="text-tenderos-slate">Plateforme</dt>
        <dd>
          {submission.customPlatformName ??
            SUBMISSION_PLATFORM_LABELS[submission.platform] ??
            submission.platform}
        </dd>
        <dt className="text-tenderos-slate">Déposé le</dt>
        <dd>{formatDateTime(submission.submittedAt)}</dd>
        <dt className="text-tenderos-slate">Référence</dt>
        <dd>{submission.platformReference ?? "—"}</dd>
        <dt className="text-tenderos-slate">Reçu</dt>
        <dd>{submission.receiptReference ?? "—"}</dd>
      </dl>

      {submission.proofs.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs">
          {submission.proofs.map((proof) => (
            <li key={proof.id}>
              {SUBMISSION_PROOF_TYPE_LABELS[proof.proofType] ?? proof.proofType} —{" "}
              <a
                href={`/app/documents/${proof.documentId}/download`}
                target="_blank"
                rel="noreferrer"
                className="text-success-fg underline"
              >
                télécharger
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {capabilities.canUploadProof ? (
        <ProofUploadForm tenderId={tenderId} submissionId={submission.id} onUpdated={onUpdated} />
      ) : null}

      <div className="flex flex-wrap items-end gap-2 text-xs">
        {capabilities.canConfirmReceipt ? (
          <>
            <label className="flex flex-col gap-1 text-tenderos-slate">
              Référence du reçu (si pas de preuve)
              <Input
                type="text"
                value={receiptReference}
                onChange={(event) => setReceiptReference(event.target.value)}
              />
            </label>
            {!receiptReference && submission.proofs.length === 0 ? (
              <label className="flex items-center gap-1 text-tenderos-slate">
                <input
                  type="checkbox"
                  checked={confirmWithoutEvidence}
                  onChange={(event) => setConfirmWithoutEvidence(event.target.checked)}
                />
                Je confirme explicitement le reçu sans référence ni preuve
              </label>
            ) : null}
            <Button
              type="button"
              disabled={
                isPending ||
                (!receiptReference && submission.proofs.length === 0 && !confirmWithoutEvidence)
              }
              onClick={() =>
                run(() =>
                  confirmSubmissionReceiptAction(tenderId, submission.id, {
                    receiptReference: receiptReference || undefined,
                    confirmedWithoutEvidence: confirmWithoutEvidence,
                  }),
                )
              }
              variant="secondary"
              size="sm"
            >
              Confirmer le reçu
            </Button>
          </>
        ) : null}

        {capabilities.canCancelSubmission ? (
          <Button
            type="button"
            disabled={isPending}
            onClick={() => run(() => cancelTenderSubmissionAction(tenderId, submission.id, {}))}
            variant="secondary"
            size="sm"
          >
            Annuler le dépôt en cours
          </Button>
        ) : null}
      </div>

      {capabilities.canWithdrawSubmission ? (
        <div className="flex flex-col gap-1 rounded bg-warning-bg p-2 text-xs">
          <p className="text-warning-fg">
            Cette action enregistre le retrait dans TenderOS. Elle ne réalise pas automatiquement le
            retrait sur la plateforme acheteur.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-tenderos-slate">
              Motif du retrait
              <Input
                type="text"
                value={withdrawalReason}
                onChange={(event) => setWithdrawalReason(event.target.value)}
              />
            </label>
            <Button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(() =>
                  withdrawTenderSubmissionAction(tenderId, submission.id, {
                    withdrawalReason: withdrawalReason || undefined,
                  }),
                )
              }
              variant="secondary"
              size="sm"
            >
              Enregistrer le retrait
            </Button>
          </div>
        </div>
      ) : null}

      {capabilities.canRecordRejection ? (
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label className="flex flex-col gap-1 text-tenderos-slate">
            Catégorie de rejet
            <Select
              value={rejectionCategory}
              onChange={(event) => setRejectionCategory(event.target.value)}
            >
              {Object.entries(SUBMISSION_REJECTION_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-tenderos-slate">
            Description
            <Input
              type="text"
              value={rejectionDescription}
              onChange={(event) => setRejectionDescription(event.target.value)}
            />
          </label>
          <Button
            type="button"
            disabled={isPending || !rejectionDescription.trim()}
            onClick={() =>
              run(() =>
                recordSubmissionRejectionAction(tenderId, submission.id, {
                  rejectionCategory,
                  rejectionDescription,
                }),
              )
            }
            variant="secondary"
            size="sm"
          >
            Enregistrer le rejet
          </Button>
        </div>
      ) : null}

      <ErrorText error={error} />
    </div>
  );
}

function ReplaceSubmissionForm({
  tenderId,
  submissionId,
  readiness,
  onReplaced,
}: {
  tenderId: string;
  submissionId: string;
  readiness: TenderSubmissionReadinessResult;
  onReplaced: (submission: TenderSubmissionSummary) => void;
}) {
  const [platform, setPlatform] = useState("PLACE");
  const [customPlatformName, setCustomPlatformName] = useState("");
  const [submittedAt, setSubmittedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit() {
    if (!readiness.packageId) return;
    setIsPending(true);
    setError(undefined);
    const result = await replaceTenderSubmissionAction(tenderId, submissionId, {
      packageId: readiness.packageId,
      platform,
      customPlatformName: PLATFORM_REQUIRING_CUSTOM_NAME.has(platform)
        ? customPlatformName
        : undefined,
      submittedAt: new Date(submittedAt).toISOString(),
    });
    setIsPending(false);
    if (result.error) setError(result.error);
    else if (result.submission) onReplaced(result.submission);
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-tenderos-navy/10 p-4 text-sm">
      <span className="font-medium">Remplacer le dépôt</span>
      <p className="text-xs text-tenderos-slate">
        Nouveau package : v{readiness.packageVersion} — hash {readiness.packageHash?.slice(0, 12)}{" "}
        (lecture seule).
      </p>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-1 text-tenderos-slate">
          Plateforme
          <Select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            {Object.entries(SUBMISSION_PLATFORM_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        {PLATFORM_REQUIRING_CUSTOM_NAME.has(platform) ? (
          <label className="flex flex-col gap-1 text-tenderos-slate">
            Nom de la plateforme
            <Input
              type="text"
              value={customPlatformName}
              onChange={(event) => setCustomPlatformName(event.target.value)}
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-tenderos-slate">
          Date et heure du dépôt
          <Input
            type="datetime-local"
            value={submittedAt}
            onChange={(event) => setSubmittedAt(event.target.value)}
          />
        </label>
        <Button
          type="button"
          disabled={isPending || !readiness.packageId}
          onClick={handleSubmit}
          variant="secondary"
          size="sm"
        >
          Remplacer
        </Button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

function HistoryTimeline({ submissions }: { submissions: TenderSubmissionSummary[] }) {
  const ordered = [...submissions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Historique</span>
      {ordered.length === 0 ? (
        <p className="text-xs text-tenderos-slate">Aucun dépôt enregistré.</p>
      ) : (
        <ol className="flex flex-col gap-1 border-l border-tenderos-navy/10 pl-3 text-xs">
          {ordered.map((submission) => (
            <li key={submission.id}>
              <span className="font-medium">
                {TENDER_SUBMISSION_STATUS_LABELS[submission.status] ?? submission.status}
              </span>{" "}
              — {SUBMISSION_PLATFORM_LABELS[submission.platform] ?? submission.platform} —{" "}
              {formatDateTime(submission.createdAt)}
              {submission.rejectionDescription ? (
                <span className="text-danger-fg"> — {submission.rejectionDescription}</span>
              ) : null}
              {submission.withdrawalReason ? (
                <span className="text-tenderos-slate"> — {submission.withdrawalReason}</span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function SubmissionSection({
  tenderId,
  initialReadiness,
  initialCapabilities,
  initialSubmissions,
}: {
  tenderId: string;
  initialReadiness: TenderSubmissionReadinessResult;
  initialCapabilities: TenderSubmissionCapabilities;
  initialSubmissions: TenderSubmissionSummary[];
}) {
  const [readiness] = useState(initialReadiness);
  const [capabilities, setCapabilities] = useState(initialCapabilities);
  const [submissions, setSubmissions] = useState(initialSubmissions);

  function applyUpdatedSubmission(submission: TenderSubmissionSummary) {
    setSubmissions((prev) => {
      const withoutUpdated = prev.filter((s) => s.id !== submission.id);
      return [...withoutUpdated, submission];
    });
    setCapabilities((prev) => ({ ...prev, activeSubmissionId: submission.id }));
  }

  const activeSubmission =
    submissions.find((s) => s.id === capabilities.activeSubmissionId) ??
    submissions.find((s) => IN_FLIGHT_STATUSES.has(s.status));

  return (
    <div className="flex flex-col gap-6">
      <ReadinessCard tenderId={tenderId} readiness={readiness} />

      {activeSubmission ? (
        <ActiveSubmissionCard
          tenderId={tenderId}
          submission={activeSubmission}
          capabilities={capabilities}
          onUpdated={applyUpdatedSubmission}
        />
      ) : capabilities.canRecordSubmission ? (
        <RecordSubmissionForm
          tenderId={tenderId}
          readiness={readiness}
          onRecorded={applyUpdatedSubmission}
        />
      ) : (
        <p className="text-sm text-tenderos-slate">
          {Object.values(capabilities.reasonsByAction)[0] ??
            "Le dépôt n'est pas encore disponible."}
        </p>
      )}

      {activeSubmission && capabilities.canReplaceSubmission ? (
        <ReplaceSubmissionForm
          tenderId={tenderId}
          submissionId={activeSubmission.id}
          readiness={readiness}
          onReplaced={applyUpdatedSubmission}
        />
      ) : null}

      <HistoryTimeline submissions={submissions} />
    </div>
  );
}
