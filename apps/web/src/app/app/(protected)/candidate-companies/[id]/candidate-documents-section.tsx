"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge, Button, EmptyState } from "../../../../../components/ui";
import {
  CANDIDATE_DOCUMENT_CATEGORY_LABELS,
  candidateDocumentDisplayLabel,
  formatFileSize,
  formatOptionalDate,
  TEMPORAL_STATUS_LABELS,
  TEMPORAL_STATUS_TONE,
  type CandidateDocument,
  type CandidateDocumentVersion,
} from "../../../../../lib/candidate-capability-types";
import {
  detachCandidateDocumentAction,
  fetchCandidateDocumentVersions,
  uploadAndAttachCandidateDocumentAction,
  type CapabilityActionState,
} from "../../../candidate-capability-actions";
import type { DocumentPickerOption } from "../../../connectors-actions";
import { FileInput } from "../../../../../components/ui/file-input";

const INITIAL_STATE: CapabilityActionState = {};

/**
 * Checkpoint TENDEROS-2.1-CCV2-F — bibliothèque documentaire de l'entreprise candidate.
 *
 * MÉTADONNÉES NULLES ASSUMÉES (finding CCV2-E.1/P3-01) : les documents migrés depuis le Legacy
 * n'ont ni `label`, ni `validFrom` — aucune source ne les portait et le backfill a refusé de les
 * inventer. Le libellé retombe VISUELLEMENT sur le nom de fichier puis sur la catégorie ; ce repli
 * n'est jamais renvoyé au backend, et `validFrom` absent s'affiche « Non renseigné », jamais une
 * date fabriquée.
 *
 * VALIDITÉ : `temporalStatus` vient du backend (`TemporalValidityStatus`, fenêtre de 30 jours). Il
 * n'est pas recalculé ici — une règle métier critique dupliquée côté interface divergerait au
 * premier ajustement.
 *
 * TÉLÉVERSEMENT : le fichier est envoyé au moteur documentaire (`POST /documents`), puis rattaché
 * par `POST /candidate-companies/:id/documents`. C'est le contrat réel de TenderOS ; le dupliquer
 * ici recréerait validation MIME, checksum et versionnement.
 */
export function CandidateDocumentsSection({
  candidateCompanyId,
  documents,
  libraryDocuments,
  canUpload,
  canDelete,
}: {
  candidateCompanyId: string;
  documents: CandidateDocument[];
  libraryDocuments: DocumentPickerOption[];
  canUpload: boolean;
  canDelete: boolean;
}) {
  const boundAction = uploadAndAttachCandidateDocumentAction.bind(null, candidateCompanyId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);
  // « Déposer un fichier » ou « choisir une pièce existante » — jamais les deux : l'action serveur
  // refuse explicitement la combinaison, et l'interface ne la propose donc pas non plus.
  const [source, setSource] = useState<"upload" | "library">("upload");

  return (
    <div className="flex flex-col gap-4">
      {documents.length === 0 ? (
        <EmptyState
          title="Aucun document d'entreprise"
          description={
            canUpload
              ? "Rattachez une pièce déjà téléversée pour la rendre disponible aux dossiers."
              : "Vous n'avez pas les droits nécessaires pour en rattacher."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-tenderos-mist text-left text-tenderos-slate">
                <th scope="col" className="py-2 pr-4 text-xs font-semibold uppercase">
                  Libellé
                </th>
                <th scope="col" className="py-2 pr-4 text-xs font-semibold uppercase">
                  Type
                </th>
                <th scope="col" className="py-2 pr-4 text-xs font-semibold uppercase">
                  Émis le
                </th>
                <th scope="col" className="py-2 pr-4 text-xs font-semibold uppercase">
                  Valide à partir du
                </th>
                <th scope="col" className="py-2 pr-4 text-xs font-semibold uppercase">
                  Échéance
                </th>
                <th scope="col" className="py-2 pr-4 text-xs font-semibold uppercase">
                  Validité
                </th>
                <th scope="col" className="py-2 text-right text-xs font-semibold uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.documentId} className="border-b border-tenderos-mist/60">
                  <td className="py-2 pr-4 font-medium text-tenderos-navy">
                    {candidateDocumentDisplayLabel(document)}
                  </td>
                  <td className="py-2 pr-4 text-tenderos-slate">
                    {CANDIDATE_DOCUMENT_CATEGORY_LABELS[document.category] ?? document.category}
                  </td>
                  <td className="py-2 pr-4 text-tenderos-slate">
                    {formatOptionalDate(document.issuedAt)}
                  </td>
                  <td className="py-2 pr-4 text-tenderos-slate">
                    {formatOptionalDate(document.validFrom)}
                  </td>
                  <td className="py-2 pr-4 text-tenderos-slate">
                    {formatOptionalDate(document.validUntil)}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge tone={TEMPORAL_STATUS_TONE[document.temporalStatus]}>
                      {TEMPORAL_STATUS_LABELS[document.temporalStatus]}
                    </Badge>
                  </td>
                  <td className="py-2 text-right">
                    <div className="relative flex items-center justify-end gap-2">
                      <a
                        href={`/api/v1/candidate-companies/${candidateCompanyId}/documents/${document.documentId}/download`}
                        className="text-sm font-medium text-tenderos-blue hover:underline"
                      >
                        Télécharger
                      </a>
                      <DocumentVersionsDisclosure
                        candidateCompanyId={candidateCompanyId}
                        documentId={document.documentId}
                      />
                      {canDelete ? (
                        <form
                          action={async () => {
                            await detachCandidateDocumentAction(
                              candidateCompanyId,
                              document.documentId,
                            );
                          }}
                        >
                          <Button type="submit" variant="ghost" size="sm">
                            Dissocier
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canUpload ? (
        <form
          action={formAction}
          className="flex flex-col gap-3 rounded-lg border border-tenderos-mist p-4"
        >
          <h3 className="text-sm font-semibold text-tenderos-navy">Ajouter un document</h3>

          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Provenance du document</legend>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  { value: "upload", label: "Déposer un fichier" },
                  { value: "library", label: "Choisir une pièce déjà téléversée" },
                ] as const
              ).map((choice) => (
                <label
                  key={choice.value}
                  className="flex items-center gap-2 text-sm text-tenderos-navy"
                >
                  <input
                    type="radio"
                    name="source"
                    value={choice.value}
                    checked={source === choice.value}
                    onChange={() => setSource(choice.value)}
                    className="accent-tenderos-blue"
                  />
                  {choice.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {source === "upload" ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="doc-file" className="text-xs font-medium text-tenderos-slate">
                  Fichier *
                </label>
                {/* Le fichier part au moteur documentaire (`POST /documents`) qui valide le type MIME,
                    calcule le checksum et crée la version 1 — l'interface n'en refait aucune partie. */}
                <FileInput id="doc-file" name="file" required />
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="doc-existingDocumentId"
                  className="text-xs font-medium text-tenderos-slate"
                >
                  Pièce de la bibliothèque *
                </label>
                {/* Un titre, jamais un identifiant à recopier : c'est tout l'objet du gap F2. */}
                <select
                  id="doc-existingDocumentId"
                  name="existingDocumentId"
                  required
                  className="rounded-md border border-tenderos-mist px-2 py-1.5 text-sm text-tenderos-navy"
                >
                  <option value="">Sélectionner…</option>
                  {libraryDocuments.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.title}
                    </option>
                  ))}
                </select>
                {libraryDocuments.length === 0 ? (
                  <p className="text-xs text-tenderos-slate">
                    Aucune pièce dans la bibliothèque documentaire pour le moment.
                  </p>
                ) : null}
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="doc-category" className="text-xs font-medium text-tenderos-slate">
                Type *
              </label>
              <select
                id="doc-category"
                name="category"
                required
                className="rounded-md border border-tenderos-mist px-2 py-1.5 text-sm text-tenderos-navy"
              >
                {Object.entries(CANDIDATE_DOCUMENT_CATEGORY_LABELS)
                  // Les pièces bancaires exigent `candidate:manage_banking` : elles ne se
                  // rattachent pas depuis la bibliothèque générale.
                  .filter(([value]) => value !== "BANK_DETAILS")
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="doc-label" className="text-xs font-medium text-tenderos-slate">
                Libellé
              </label>
              <input
                id="doc-label"
                name="label"
                className="rounded-md border border-tenderos-mist px-2 py-1.5 text-sm text-tenderos-navy"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="doc-issuedAt" className="text-xs font-medium text-tenderos-slate">
                Émis le
              </label>
              <input
                id="doc-issuedAt"
                name="issuedAt"
                type="date"
                className="rounded-md border border-tenderos-mist px-2 py-1.5 text-sm text-tenderos-navy"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="doc-validFrom" className="text-xs font-medium text-tenderos-slate">
                Valide à partir du
              </label>
              <input
                id="doc-validFrom"
                name="validFrom"
                type="date"
                className="rounded-md border border-tenderos-mist px-2 py-1.5 text-sm text-tenderos-navy"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="doc-validUntil" className="text-xs font-medium text-tenderos-slate">
                Échéance
              </label>
              <input
                id="doc-validUntil"
                name="validUntil"
                type="date"
                className="rounded-md border border-tenderos-mist px-2 py-1.5 text-sm text-tenderos-navy"
              />
            </div>
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-danger-fg">
              {state.error}
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Ajout en cours…" : "Ajouter le document"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/**
 * Checkpoint CCV2-F.1 — gap F1 : historique des versions d'une pièce candidate.
 *
 * Chargé À LA DEMANDE : afficher l'historique de chaque ligne coûterait un appel par document à
 * l'ouverture de l'onglet, pour une information consultée exceptionnellement.
 *
 * La version courante est signalée d'après `currentVersionId` renvoyé par l'API — le pointeur réel
 * porté par le Document — et non d'après le numéro le plus élevé de la liste.
 */
function DocumentVersionsDisclosure({
  candidateCompanyId,
  documentId,
}: {
  candidateCompanyId: string;
  documentId: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<{
    versions: CandidateDocumentVersion[];
    currentVersionId?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoading] = useTransition();

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (view || isLoading) return;
    startLoading(async () => {
      try {
        setView(await fetchCandidateDocumentVersions(candidateCompanyId, documentId));
        setError(null);
      } catch {
        // L'API a refusé ou répondu 404 : on le dit. Un historique vide se lirait à tort comme
        // « ce document n'a qu'une seule version ».
        setError("Historique indisponible.");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`versions-${documentId}`}
      >
        Versions
      </Button>
      {open ? (
        <div
          id={`versions-${documentId}`}
          className="absolute right-0 top-full z-10 mt-1 w-80 rounded-lg border border-tenderos-mist bg-white p-3 text-left shadow-lg"
        >
          <p className="mb-2 text-xs font-semibold uppercase text-tenderos-slate">
            Historique des versions
          </p>
          {isLoading ? <p className="text-sm text-tenderos-slate">Chargement…</p> : null}
          {error ? (
            <p role="alert" className="text-sm text-danger-fg">
              {error}
            </p>
          ) : null}
          {view ? (
            <ul className="flex flex-col gap-2">
              {[...view.versions]
                .sort((a, b) => b.versionNumber - a.versionNumber)
                .map((version) => (
                  <li key={version.id} className="flex items-start justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm text-tenderos-navy">
                        v{version.versionNumber} — {version.originalFilename}
                      </span>
                      <span className="text-xs text-tenderos-slate">
                        {formatOptionalDate(version.createdAt)} ·{" "}
                        {formatFileSize(version.sizeBytes)}
                      </span>
                    </div>
                    {version.id === view.currentVersionId ? (
                      <Badge tone="success">Courante</Badge>
                    ) : null}
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
