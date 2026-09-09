"use client";

import { useActionState, useRef, useState, type FormEvent } from "react";
import {
  deleteDceDocumentAction,
  fetchDceSectionData,
  getDceImportJobAction,
  importDceFilesAction,
  initDceAction,
  startDceZipImportAction,
  type ImportActionState,
} from "../../../dce-actions";
import { getAnalysisJobAction, retryDocumentAnalysisAction, startDocumentAnalysisAction } from "../../../analysis-actions";
import { ANALYSIS_CAPABILITY_REASON_LABELS, ANALYSIS_STATUS_LABELS, type AnalysisCapability, type AnalysisJobSummary } from "../../../../../lib/analysis-types";
import {
  DCE_DOCUMENT_PROCESSING_STATUS_LABELS,
  DCE_IMPORT_JOB_STATUS_LABELS,
  formatDceFileSize,
  isReadyForAnalysis,
  isTerminalDceImportJobStatus,
  type DceDocumentSummary,
  type DceImportJobSummary,
  type DceSummary,
} from "../../../../../lib/dce-types";
import { Badge, type BadgeTone } from "../../../../../components/ui/badge";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { EmptyState } from "../../../../../components/ui/empty-state";

const NON_TERMINAL_ANALYSIS_STATUSES = ["PENDING", "QUEUED", "PROCESSING"];

function analysisStatusTone(status: AnalysisJobSummary["status"]): BadgeTone {
  switch (status) {
    case "SUCCEEDED":
    case "PARTIALLY_SUCCEEDED":
      return "success";
    case "FAILED":
      return "danger";
    case "CANCELLED":
      return "neutral";
    default:
      return "info";
  }
}

/**
 * Contrôle "Analyser" par document (mission Sprint 8A.2 — StartDocumentAnalysisUseCase existait
 * déjà côté backend mais n'avait jamais de déclencheur côté écran Tender). Désactivé tant que
 * `processingStatus` n'indique pas une extraction terminée — jamais une autorité réelle, seulement
 * un confort évitant un aller-retour API pour un état déjà connu côté client. Le statut affiché
 * n'est connu que pour la session en cours (aucune lecture "dernière analyse de ce document"
 * persistée côté API à ce jour) — un rechargement de page réinitialise ce contrôle à son état
 * initial "Analyser", sans perdre l'analyse déjà lancée côté backend.
 */
function DocumentAnalysisControl({ tenderId, documentId, processingStatus, canAnalyze, analysisCapability }: {
  tenderId: string;
  documentId: string;
  processingStatus: DceDocumentSummary["processingStatus"];
  canAnalyze: boolean;
  analysisCapability: AnalysisCapability | undefined;
}) {
  const [job, setJob] = useState<AnalysisJobSummary | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const ready = isReadyForAnalysis(processingStatus);
  // Mission — "ne pas afficher Analyser disponible si la config IA manque". `analysisCapability`
  // absent (route non encore appelée) est traité comme prêt, jamais un blocage inventé.
  const capabilityReasonCode = analysisCapability && !analysisCapability.ready ? analysisCapability.reasonCode : undefined;
  const isRunning = job !== undefined && NON_TERMINAL_ANALYSIS_STATUSES.includes(job.status);

  async function handleStart(): Promise<void> {
    setIsPending(true);
    const result = await startDocumentAnalysisAction(tenderId, documentId);
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(undefined);
    setJob(result.job);
  }

  async function handleRetry(): Promise<void> {
    if (!job) return;
    setIsPending(true);
    const result = await retryDocumentAnalysisAction(job.id);
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(undefined);
    setJob(result.job);
  }

  async function handleRefresh(): Promise<void> {
    if (!job) return;
    setIsPending(true);
    const result = await getAnalysisJobAction(job.id);
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(undefined);
    setJob(result.job);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Badge tone="neutral">{DCE_DOCUMENT_PROCESSING_STATUS_LABELS[processingStatus]}</Badge>
        {job ? <Badge tone={analysisStatusTone(job.status)}>{ANALYSIS_STATUS_LABELS[job.status]}</Badge> : null}
      </div>
      {canAnalyze ? (
        <div className="flex items-center gap-2">
          {job ? (
            <button
              type="button"
              disabled={isPending}
              onClick={handleRefresh}
              className="text-xs font-medium text-tenderos-blue hover:underline disabled:opacity-50"
            >
              Actualiser
            </button>
          ) : null}
          {!job || (!isRunning && job.status !== "FAILED") ? (
            <button
              type="button"
              disabled={isPending || !ready || isRunning || capabilityReasonCode !== undefined}
              onClick={handleStart}
              className="rounded-lg border border-tenderos-navy/15 px-2.5 py-1 text-xs font-medium text-tenderos-navy hover:bg-tenderos-light disabled:opacity-50"
            >
              Analyser
            </button>
          ) : null}
          {job?.status === "FAILED" ? (
            <button
              type="button"
              disabled={isPending}
              onClick={handleRetry}
              className="rounded-lg border border-tenderos-navy/15 px-2.5 py-1 text-xs font-medium text-tenderos-navy hover:bg-tenderos-light disabled:opacity-50"
            >
              Relancer
            </button>
          ) : null}
        </div>
      ) : null}
      {capabilityReasonCode ? (
        <p role="alert" className="text-xs text-amber-700">
          {ANALYSIS_CAPABILITY_REASON_LABELS[capabilityReasonCode] ?? "L'analyse IA n'est pas disponible pour le moment."}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const INITIAL_IMPORT_STATE: ImportActionState = {};

function ImportResultSummary({ result }: { result: ImportActionState["result"] }) {
  if (!result) return null;
  if (result.accepted.length === 0 && result.rejected.length === 0) return null;

  return (
    <ul className="w-full text-xs">
      {result.accepted.map((doc) => (
        <li key={doc.documentId} className="text-green-700">
          {doc.originalFilename} — importe
        </li>
      ))}
      {result.rejected.map((entry) => (
        <li key={entry.originalFilename} className="text-red-600">
          {entry.originalFilename} — refuse ({entry.reason})
        </li>
      ))}
    </ul>
  );
}

function DeleteDocumentButton({ tenderId, documentId }: { tenderId: string; documentId: string }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={async () => {
          setIsPending(true);
          const result = await deleteDceDocumentAction(tenderId, documentId);
          setIsPending(false);
          setError(result.error);
        }}
        className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
      >
        Supprimer
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function InitDceButton({ tenderId, onSettled }: { tenderId: string; onSettled: () => void }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        variant="primary"
        disabled={isPending}
        onClick={async () => {
          setIsPending(true);
          const result = await initDceAction(tenderId);
          setIsPending(false);
          setError(result.error);
          // Mission Sprint 8A.2 (audit Cockpit Bid Manager, découvert via le parcours Playwright)
          // — `initDceAction` ne fait que `revalidatePath` (cache serveur pour la PROCHAINE
          // navigation) : sans ce rafraîchissement explicite, `liveDce` restait `null` côté client
          // après un succès, l'écran affichant encore "Aucun DCE initialisé" bien que le DCE
          // existe déjà réellement en base — même motif que `ZipImportControl.onSettled`.
          if (!result.error) onSettled();
        }}
      >
        Initialiser le DCE
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const IMPORT_JOB_POLL_INTERVAL_MS = 700;

/**
 * Import ZIP asynchrone (mission Sprint 8A.2, correction bug #3 "import ZIP lourd échoue ou
 * bloque") — la soumission répond immédiatement avec un job (CREATED), sondé ensuite côté client
 * jusqu'à un statut terminal, jamais une attente bloquante d'une requête HTTP unique. `onSettled`
 * rafraîchit la liste des documents une fois le job terminal (nouveaux documents importés).
 */
function ZipImportControl({ tenderId, onSettled }: { tenderId: string; onSettled: () => void }) {
  const [job, setJob] = useState<DceImportJobSummary | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const formRef = useRef<HTMLFormElement>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function schedulePoll(jobId: string): void {
    pollTimer.current = setTimeout(async () => {
      const result = await getDceImportJobAction(tenderId, jobId);
      if (result.error || !result.job) {
        setError(result.error ?? "Impossible de suivre l'import.");
        return;
      }
      setJob(result.job);
      if (isTerminalDceImportJobStatus(result.job.status)) {
        onSettled();
      } else {
        schedulePoll(jobId);
      }
    }, IMPORT_JOB_POLL_INTERVAL_MS);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setError(undefined);
    setJob(undefined);
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const result = await startDceZipImportAction(tenderId, formData);
    setIsSubmitting(false);
    if (result.error || !result.job) {
      setError(result.error ?? "Impossible de démarrer l'import.");
      return;
    }
    setJob(result.job);
    formRef.current?.reset();
    schedulePoll(result.job.id);
  }

  const isRunning = job !== undefined && !isTerminalDceImportJobStatus(job.status);

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <input name="archive" type="file" accept=".zip" className="min-w-0 max-w-full text-xs" />
        <Button type="submit" disabled={isSubmitting || isRunning}>
          Importer une archive ZIP
        </Button>
      </div>
      {job ? (
        <p className="text-xs text-tenderos-slate">
          {DCE_IMPORT_JOB_STATUS_LABELS[job.status]}
          {job.totalFiles !== undefined ? ` — ${job.totalFiles} fichier(s)` : ""}
        </p>
      ) : null}
      {job?.status === "FAILED" && job.errorMessage ? (
        <p role="alert" className="text-xs text-red-600">
          {job.errorMessage}
        </p>
      ) : null}
      {job?.result ? <ImportResultSummary result={job.result} /> : null}
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Section "DCE" (Dossier de Consultation des Entreprises) de la fiche Tender — mission Sprint 0/1.
 * Un Tender ne porte jamais plus d'un DCE : tant que `dce` est `null` (aucune initialisation
 * encore faite — GET renvoie 404, voir fetchDceForTender), seule l'action d'initialisation est
 * proposee. AUDIT-005 (meme motif que LotsSection/DocumentsSection) : `canManage` ne fait que
 * griser/masquer l'affichage, jamais l'autorite reelle (revalidee par dce:import/delete cote API).
 */
export function DceSection({
  tenderId,
  dce,
  documents,
  canManage,
  canDelete,
  canAnalyze,
  analysisCapability,
}: {
  tenderId: string;
  dce: DceSummary | null;
  documents: DceDocumentSummary[];
  canManage: boolean;
  canDelete: boolean;
  canAnalyze: boolean;
  analysisCapability?: AnalysisCapability | undefined;
}) {
  const importFilesBoundAction = importDceFilesAction.bind(null, tenderId);
  const [importFilesState, importFilesFormAction, isImportingFiles] = useActionState(
    importFilesBoundAction,
    INITIAL_IMPORT_STATE,
  );

  const [liveDce, setLiveDce] = useState(dce);
  const [liveDocuments, setLiveDocuments] = useState(documents);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleRefresh(): Promise<void> {
    setIsRefreshing(true);
    try {
      const fresh = await fetchDceSectionData(tenderId);
      setLiveDce(fresh.dce);
      setLiveDocuments(fresh.documents);
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <Card
      title="DCE"
      actions={
        liveDce ? (
          <Button variant="secondary" disabled={isRefreshing} onClick={handleRefresh}>
            Actualiser
          </Button>
        ) : null
      }
    >
      {!liveDce ? (
        <EmptyState
          title="Aucun DCE initialisé"
          description="Initialisez le DCE de cet appel d'offres pour commencer à importer ses documents."
          actions={canManage ? <InitDceButton tenderId={tenderId} onSettled={handleRefresh} /> : undefined}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {liveDocuments.length === 0 ? (
            <EmptyState title="Aucun document du DCE." description="Importez des fichiers individuels ou une archive ZIP ci-dessous." />
          ) : (
            <ul>
              {liveDocuments.map((doc) => (
                <li
                  key={doc.documentId}
                  className="flex items-center justify-between gap-2 border-b border-tenderos-navy/5 py-2.5 text-sm last:border-b-0"
                >
                  <div>
                    <span className="font-semibold text-tenderos-navy">{doc.originalFilename}</span>
                    <span className="ml-2 text-xs text-tenderos-slate">{formatDceFileSize(doc.sizeBytes)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <DocumentAnalysisControl
                      tenderId={tenderId}
                      documentId={doc.documentId}
                      processingStatus={doc.processingStatus}
                      canAnalyze={canAnalyze}
                      analysisCapability={analysisCapability}
                    />
                    <a
                      href={`/app/tenders/${tenderId}/dce-documents/${doc.documentId}/download`}
                      className="text-xs font-medium text-tenderos-blue hover:underline"
                    >
                      Télécharger
                    </a>
                    {canDelete ? <DeleteDocumentButton tenderId={tenderId} documentId={doc.documentId} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {canManage ? (
            <div className="flex flex-col gap-3 border-t border-tenderos-navy/10 pt-3">
              <form action={importFilesFormAction} className="flex flex-col items-start gap-2">
                <div className="flex flex-wrap items-end gap-2">
                  <input name="files" type="file" multiple className="min-w-0 max-w-full text-xs" />
                  <Button type="submit" disabled={isImportingFiles}>
                    Importer
                  </Button>
                </div>
                {importFilesState.error ? (
                  <p role="alert" className="text-xs text-red-600">
                    {importFilesState.error}
                  </p>
                ) : null}
                <ImportResultSummary result={importFilesState.result} />
              </form>

              <ZipImportControl tenderId={tenderId} onSettled={handleRefresh} />
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
