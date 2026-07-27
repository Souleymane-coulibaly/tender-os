"use client";

import { useActionState, useState } from "react";
import {
  deleteDceDocumentAction,
  importDceFilesAction,
  importDceZipAction,
  initDceAction,
  type ImportActionState,
} from "../../../dce-actions";
import { formatDceFileSize, type DceDocumentSummary, type DceSummary } from "../../../../../lib/dce-types";

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
        className="text-xs text-red-700 hover:underline disabled:opacity-50"
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

function InitDceButton({ tenderId }: { tenderId: string }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={async () => {
          setIsPending(true);
          const result = await initDceAction(tenderId);
          setIsPending(false);
          setError(result.error);
        }}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
      >
        Initialiser le DCE
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
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
}: {
  tenderId: string;
  dce: DceSummary | null;
  documents: DceDocumentSummary[];
  canManage: boolean;
  canDelete: boolean;
}) {
  const importFilesBoundAction = importDceFilesAction.bind(null, tenderId);
  const [importFilesState, importFilesFormAction, isImportingFiles] = useActionState(
    importFilesBoundAction,
    INITIAL_IMPORT_STATE,
  );

  const importZipBoundAction = importDceZipAction.bind(null, tenderId);
  const [importZipState, importZipFormAction, isImportingZip] = useActionState(
    importZipBoundAction,
    INITIAL_IMPORT_STATE,
  );

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-700">DCE</h2>

      {!dce ? (
        <>
          <p className="text-sm text-neutral-500">Aucun DCE initialise pour cet appel d&apos;offres.</p>
          {canManage ? <InitDceButton tenderId={tenderId} /> : null}
        </>
      ) : (
        <>
          {documents.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucun document du DCE.</p>
          ) : (
            <ul>
              {documents.map((doc) => (
                <li
                  key={doc.documentId}
                  className="flex items-center justify-between gap-2 border-b border-neutral-100 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium text-neutral-900">{doc.originalFilename}</span>
                    <span className="ml-2 text-xs text-neutral-500">{formatDceFileSize(doc.sizeBytes)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={`/app/tenders/${tenderId}/dce-documents/${doc.documentId}/download`}
                      className="text-xs text-neutral-700 hover:underline"
                    >
                      Telecharger
                    </a>
                    {canDelete ? <DeleteDocumentButton tenderId={tenderId} documentId={doc.documentId} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {canManage ? (
            <>
              <form action={importFilesFormAction} className="flex flex-col items-start gap-2">
                <div className="flex items-end gap-2">
                  <input name="files" type="file" multiple className="text-xs" />
                  <button
                    type="submit"
                    disabled={isImportingFiles}
                    className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
                  >
                    Importer
                  </button>
                </div>
                {importFilesState.error ? (
                  <p role="alert" className="text-xs text-red-600">
                    {importFilesState.error}
                  </p>
                ) : null}
                <ImportResultSummary result={importFilesState.result} />
              </form>

              <form action={importZipFormAction} className="flex flex-col items-start gap-2">
                <div className="flex items-end gap-2">
                  <input name="archive" type="file" accept=".zip" className="text-xs" />
                  <button
                    type="submit"
                    disabled={isImportingZip}
                    className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
                  >
                    Importer une archive ZIP
                  </button>
                </div>
                {importZipState.error ? (
                  <p role="alert" className="text-xs text-red-600">
                    {importZipState.error}
                  </p>
                ) : null}
                <ImportResultSummary result={importZipState.result} />
              </form>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
