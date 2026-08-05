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
import {
  SUBMISSION_PLATFORM_LABELS,
  SUBMISSION_PROOF_TYPE_LABELS,
  SUBMISSION_REJECTION_CATEGORY_LABELS,
  TENDER_SUBMISSION_STATUS_LABELS,
  type TenderSubmissionCapabilities,
  type TenderSubmissionReadinessResult,
  type TenderSubmissionSummary,
} from "../../../../../../lib/submission-types";

const PLATFORM_REQUIRING_CUSTOM_NAME = new Set(["OTHER", "PLATEFORME_ACHETEUR"]);
const IN_FLIGHT_STATUSES = new Set(["SUBMISSION_IN_PROGRESS", "SUBMITTED", "RECEIPT_CONFIRMED"]);

function ErrorText({ error }: { error: string | undefined }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-xs text-red-700">
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

function ReadinessCard({ readiness }: { readiness: TenderSubmissionReadinessResult }) {
  return (
    <div className="flex flex-col gap-2 rounded border border-neutral-200 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">État de préparation</span>
        <span className="rounded bg-neutral-100 px-2 py-1 text-xs font-medium">{readiness.readinessStatus}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-700 sm:grid-cols-4">
        <dt className="text-neutral-500">Package</dt>
        <dd>{readiness.packageId ? `v${readiness.packageVersion}` : "—"}</dd>
        <dt className="text-neutral-500">Hash (court)</dt>
        <dd className="truncate">{readiness.packageHash ? readiness.packageHash.slice(0, 12) : "—"}</dd>
        <dt className="text-neutral-500">Date limite</dt>
        <dd>{formatDateTime(readiness.deadline)}</dd>
        <dt className="text-neutral-500">Temps restant</dt>
        <dd>{formatRemainingTime(readiness.remainingTimeMs) ?? "—"}</dd>
      </dl>
      {readiness.blockers.length > 0 ? (
        <ul className="list-disc pl-4 text-xs text-red-700">
          {readiness.blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : null}
      {readiness.warnings.length > 0 ? (
        <ul className="list-disc pl-4 text-xs text-amber-700">
          {readiness.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {readiness.requiredActions.length > 0 ? (
        <p className="text-xs text-neutral-600">Prochaines actions : {readiness.requiredActions.join(" → ")}</p>
      ) : null}
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
      customPlatformName: PLATFORM_REQUIRING_CUSTOM_NAME.has(platform) ? customPlatformName : undefined,
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
    <div className="flex flex-col gap-3 rounded border border-neutral-200 p-4 text-sm">
      <span className="font-medium">Enregistrer un dépôt</span>
      <p className="text-xs text-neutral-600">Package : v{readiness.packageVersion} — hash {readiness.packageHash?.slice(0, 12)} (lecture seule).</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Plateforme
          <select value={platform} onChange={(event) => setPlatform(event.target.value)} className="rounded border border-neutral-300 px-2 py-1">
            {Object.entries(SUBMISSION_PLATFORM_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {PLATFORM_REQUIRING_CUSTOM_NAME.has(platform) ? (
          <label className="flex flex-col gap-1 text-xs text-neutral-600">
            Nom de la plateforme
            <input type="text" value={customPlatformName} onChange={(event) => setCustomPlatformName(event.target.value)} className="rounded border border-neutral-300 px-2 py-1" />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Date et heure du dépôt
          <input type="datetime-local" value={submittedAt} onChange={(event) => setSubmittedAt(event.target.value)} className="rounded border border-neutral-300 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Référence du dépôt
          <input type="text" value={platformReference} onChange={(event) => setPlatformReference(event.target.value)} className="rounded border border-neutral-300 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Référence du reçu
          <input type="text" value={receiptReference} onChange={(event) => setReceiptReference(event.target.value)} className="rounded border border-neutral-300 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Notes
          <input type="text" value={notes} onChange={(event) => setNotes(event.target.value)} className="rounded border border-neutral-300 px-2 py-1" />
        </label>
        <button type="button" disabled={isPending || !readiness.packageId} onClick={handleSubmit} className="rounded border border-neutral-300 px-3 py-1 disabled:opacity-50">
          Enregistrer le dépôt
        </button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

function ProofUploadForm({ tenderId, submissionId, onUpdated }: { tenderId: string; submissionId: string; onUpdated: (submission: TenderSubmissionSummary) => void }) {
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
      <label className="flex flex-col gap-1 text-neutral-600">
        Type de preuve
        <select value={proofType} onChange={(event) => setProofType(event.target.value)} className="rounded border border-neutral-300 px-2 py-1">
          {Object.entries(SUBMISSION_PROOF_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-neutral-600">
        Fichier
        <input type="file" name="file" required className="text-xs" />
      </label>
      <button type="submit" disabled={isPending} className="rounded border border-neutral-300 px-3 py-1 disabled:opacity-50">
        Ajouter la preuve
      </button>
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

  async function run(action: () => Promise<{ error?: string; submission?: TenderSubmissionSummary }>) {
    setIsPending(true);
    setError(undefined);
    const result = await action();
    setIsPending(false);
    if (result.error) setError(result.error);
    else if (result.submission) onUpdated(result.submission);
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-neutral-200 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">Dépôt actif</span>
        <span className="rounded bg-neutral-100 px-2 py-1 text-xs font-medium">{TENDER_SUBMISSION_STATUS_LABELS[submission.status] ?? submission.status}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-700 sm:grid-cols-4">
        <dt className="text-neutral-500">Plateforme</dt>
        <dd>{submission.customPlatformName ?? SUBMISSION_PLATFORM_LABELS[submission.platform] ?? submission.platform}</dd>
        <dt className="text-neutral-500">Déposé le</dt>
        <dd>{formatDateTime(submission.submittedAt)}</dd>
        <dt className="text-neutral-500">Référence</dt>
        <dd>{submission.platformReference ?? "—"}</dd>
        <dt className="text-neutral-500">Reçu</dt>
        <dd>{submission.receiptReference ?? "—"}</dd>
      </dl>

      {submission.proofs.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs">
          {submission.proofs.map((proof) => (
            <li key={proof.id}>
              {SUBMISSION_PROOF_TYPE_LABELS[proof.proofType] ?? proof.proofType} —{" "}
              <a href={`/app/documents/${proof.documentId}/download`} target="_blank" rel="noreferrer" className="text-emerald-700 underline">
                télécharger
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {capabilities.canUploadProof ? <ProofUploadForm tenderId={tenderId} submissionId={submission.id} onUpdated={onUpdated} /> : null}

      <div className="flex flex-wrap items-end gap-2 text-xs">
        {capabilities.canConfirmReceipt ? (
          <>
            <label className="flex flex-col gap-1 text-neutral-600">
              Référence du reçu (si pas de preuve)
              <input type="text" value={receiptReference} onChange={(event) => setReceiptReference(event.target.value)} className="rounded border border-neutral-300 px-2 py-1" />
            </label>
            {!receiptReference && submission.proofs.length === 0 ? (
              <label className="flex items-center gap-1 text-neutral-600">
                <input type="checkbox" checked={confirmWithoutEvidence} onChange={(event) => setConfirmWithoutEvidence(event.target.checked)} />
                Je confirme explicitement le reçu sans référence ni preuve
              </label>
            ) : null}
            <button
              type="button"
              disabled={isPending || (!receiptReference && submission.proofs.length === 0 && !confirmWithoutEvidence)}
              onClick={() => run(() => confirmSubmissionReceiptAction(tenderId, submission.id, { receiptReference: receiptReference || undefined, confirmedWithoutEvidence: confirmWithoutEvidence }))}
              className="rounded border border-neutral-300 px-3 py-1 disabled:opacity-50"
            >
              Confirmer le reçu
            </button>
          </>
        ) : null}

        {capabilities.canCancelSubmission ? (
          <button type="button" disabled={isPending} onClick={() => run(() => cancelTenderSubmissionAction(tenderId, submission.id, {}))} className="rounded border border-neutral-300 px-3 py-1 disabled:opacity-50">
            Annuler le dépôt en cours
          </button>
        ) : null}
      </div>

      {capabilities.canWithdrawSubmission ? (
        <div className="flex flex-col gap-1 rounded border border-amber-200 bg-amber-50 p-2 text-xs">
          <p className="text-amber-800">Cette action enregistre le retrait dans TenderOS. Elle ne réalise pas automatiquement le retrait sur la plateforme acheteur.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-neutral-600">
              Motif du retrait
              <input type="text" value={withdrawalReason} onChange={(event) => setWithdrawalReason(event.target.value)} className="rounded border border-neutral-300 px-2 py-1" />
            </label>
            <button type="button" disabled={isPending} onClick={() => run(() => withdrawTenderSubmissionAction(tenderId, submission.id, { withdrawalReason: withdrawalReason || undefined }))} className="rounded border border-neutral-300 px-3 py-1 disabled:opacity-50">
              Enregistrer le retrait
            </button>
          </div>
        </div>
      ) : null}

      {capabilities.canRecordRejection ? (
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label className="flex flex-col gap-1 text-neutral-600">
            Catégorie de rejet
            <select value={rejectionCategory} onChange={(event) => setRejectionCategory(event.target.value)} className="rounded border border-neutral-300 px-2 py-1">
              {Object.entries(SUBMISSION_REJECTION_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-neutral-600">
            Description
            <input type="text" value={rejectionDescription} onChange={(event) => setRejectionDescription(event.target.value)} className="rounded border border-neutral-300 px-2 py-1" />
          </label>
          <button
            type="button"
            disabled={isPending || !rejectionDescription.trim()}
            onClick={() => run(() => recordSubmissionRejectionAction(tenderId, submission.id, { rejectionCategory, rejectionDescription }))}
            className="rounded border border-neutral-300 px-3 py-1 disabled:opacity-50"
          >
            Enregistrer le rejet
          </button>
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
      customPlatformName: PLATFORM_REQUIRING_CUSTOM_NAME.has(platform) ? customPlatformName : undefined,
      submittedAt: new Date(submittedAt).toISOString(),
    });
    setIsPending(false);
    if (result.error) setError(result.error);
    else if (result.submission) onReplaced(result.submission);
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-neutral-200 p-4 text-sm">
      <span className="font-medium">Remplacer le dépôt</span>
      <p className="text-xs text-neutral-600">Nouveau package : v{readiness.packageVersion} — hash {readiness.packageHash?.slice(0, 12)} (lecture seule).</p>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-1 text-neutral-600">
          Plateforme
          <select value={platform} onChange={(event) => setPlatform(event.target.value)} className="rounded border border-neutral-300 px-2 py-1">
            {Object.entries(SUBMISSION_PLATFORM_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {PLATFORM_REQUIRING_CUSTOM_NAME.has(platform) ? (
          <label className="flex flex-col gap-1 text-neutral-600">
            Nom de la plateforme
            <input type="text" value={customPlatformName} onChange={(event) => setCustomPlatformName(event.target.value)} className="rounded border border-neutral-300 px-2 py-1" />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-neutral-600">
          Date et heure du dépôt
          <input type="datetime-local" value={submittedAt} onChange={(event) => setSubmittedAt(event.target.value)} className="rounded border border-neutral-300 px-2 py-1" />
        </label>
        <button type="button" disabled={isPending || !readiness.packageId} onClick={handleSubmit} className="rounded border border-neutral-300 px-3 py-1 disabled:opacity-50">
          Remplacer
        </button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

function HistoryTimeline({ submissions }: { submissions: TenderSubmissionSummary[] }) {
  const ordered = [...submissions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Historique</span>
      {ordered.length === 0 ? (
        <p className="text-xs text-neutral-500">Aucun dépôt enregistré.</p>
      ) : (
        <ol className="flex flex-col gap-1 border-l border-neutral-200 pl-3 text-xs">
          {ordered.map((submission) => (
            <li key={submission.id}>
              <span className="font-medium">{TENDER_SUBMISSION_STATUS_LABELS[submission.status] ?? submission.status}</span> — {SUBMISSION_PLATFORM_LABELS[submission.platform] ?? submission.platform} —{" "}
              {formatDateTime(submission.createdAt)}
              {submission.rejectionDescription ? <span className="text-red-700"> — {submission.rejectionDescription}</span> : null}
              {submission.withdrawalReason ? <span className="text-neutral-600"> — {submission.withdrawalReason}</span> : null}
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

  const activeSubmission = submissions.find((s) => s.id === capabilities.activeSubmissionId) ?? submissions.find((s) => IN_FLIGHT_STATUSES.has(s.status));

  return (
    <div className="flex flex-col gap-6">
      <ReadinessCard readiness={readiness} />

      {activeSubmission ? (
        <ActiveSubmissionCard tenderId={tenderId} submission={activeSubmission} capabilities={capabilities} onUpdated={applyUpdatedSubmission} />
      ) : capabilities.canRecordSubmission ? (
        <RecordSubmissionForm tenderId={tenderId} readiness={readiness} onRecorded={applyUpdatedSubmission} />
      ) : (
        <p className="text-sm text-neutral-500">{Object.values(capabilities.reasonsByAction)[0] ?? "Le dépôt n'est pas encore disponible."}</p>
      )}

      {activeSubmission && capabilities.canReplaceSubmission ? <ReplaceSubmissionForm tenderId={tenderId} submissionId={activeSubmission.id} readiness={readiness} onReplaced={applyUpdatedSubmission} /> : null}

      <HistoryTimeline submissions={submissions} />
    </div>
  );
}
