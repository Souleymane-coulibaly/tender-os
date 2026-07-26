"use client";

import { useActionState, useState } from "react";
import {
  attachExistingDocumentToTenderAction,
  detachDocumentFromTenderAction,
  uploadAndAttachDocumentToTenderAction,
  type FormActionState,
} from "../../../documents-actions";
import { formatFileSize, type DocumentSummary } from "../../../../../lib/documents-types";

const INITIAL_STATE: FormActionState = {};

function DetachButton({ tenderId, documentId }: { tenderId: string; documentId: string }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={async () => {
          setIsPending(true);
          const result = await detachDocumentFromTenderAction(tenderId, documentId);
          setIsPending(false);
          setError(result.error);
        }}
        className="text-xs text-red-700 hover:underline disabled:opacity-50"
      >
        Detacher
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Section "Documents" de la fiche Tender — attache par depot direct (creation + association
 *  composees, voir uploadAndAttachDocumentToTenderAction) ou par ID d'un document existant
 *  (aucun selecteur de recherche dans cette tranche — la bibliotheque /app/documents reste le
 *  point d'entree pour retrouver l'identifiant d'un document deja depose). */
export function DocumentsSection({
  tenderId,
  documents,
  canManage,
}: {
  tenderId: string;
  documents: DocumentSummary[];
  canManage: boolean;
}) {
  const uploadAction = uploadAndAttachDocumentToTenderAction.bind(null, tenderId);
  const [uploadState, uploadFormAction, isUploading] = useActionState(uploadAction, INITIAL_STATE);

  const attachAction = attachExistingDocumentToTenderAction.bind(null, tenderId);
  const [attachState, attachFormAction, isAttaching] = useActionState(attachAction, INITIAL_STATE);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-700">Documents</h2>
      {documents.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucun document rattache.</p>
      ) : (
        <ul>
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-2 border-b border-neutral-100 py-2 text-sm">
              <div>
                <a href={`/app/documents/${doc.id}`} className="font-medium text-neutral-900 hover:underline">
                  {doc.title}
                </a>
                {doc.currentVersion ? (
                  <span className="ml-2 text-xs text-neutral-500">{formatFileSize(doc.currentVersion.sizeBytes)}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <a href={`/app/documents/${doc.id}/download`} className="text-xs text-neutral-700 hover:underline">
                  Telecharger
                </a>
                {canManage ? <DetachButton tenderId={tenderId} documentId={doc.id} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <>
          <form action={uploadFormAction} className="flex items-end gap-2">
            <input
              name="title"
              type="text"
              required
              placeholder="Titre du document..."
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            />
            <input name="category" type="text" placeholder="Categorie" className="rounded border border-neutral-300 px-2 py-1 text-sm" />
            <input name="file" type="file" required className="text-xs" />
            <button
              type="submit"
              disabled={isUploading}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
            >
              Deposer et rattacher
            </button>
            {uploadState.error ? (
              <p role="alert" className="text-xs text-red-600">
                {uploadState.error}
              </p>
            ) : null}
          </form>

          <form action={attachFormAction} className="flex items-end gap-2">
            <input
              name="documentId"
              type="text"
              placeholder="ID d'un document existant..."
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            />
            <button
              type="submit"
              disabled={isAttaching}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
            >
              Rattacher
            </button>
            {attachState.error ? (
              <p role="alert" className="text-xs text-red-600">
                {attachState.error}
              </p>
            ) : null}
          </form>
        </>
      ) : null}
    </section>
  );
}
