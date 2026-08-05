"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  attachAdministrativeDocumentRevisionAction,
  confirmAdministrativeRequirementAction,
  createAdministrativeDocumentAction,
  createAdministrativeRequirementAction,
  getAdministrativeDocumentAction,
  markAdministrativeRequirementNotApplicableAction,
  recordAdministrativeDocumentSignatureAction,
  rejectAdministrativeDocumentAction,
  rejectAdministrativeRequirementAction,
  setAdministrativeDocumentSignatureModeAction,
  validateAdministrativeDocumentAction,
} from "../../../../../administrative-dossier-actions";
import {
  ADMINISTRATIVE_CHECKLIST_STATE_LABELS,
  ADMINISTRATIVE_SIGNATURE_MODE_LABELS,
  ADMINISTRATIVE_SIGNATURE_STATUS_LABELS,
  administrativeChecklistStateBadgeClass,
  type AdministrativeChecklist,
  type AdministrativeDocumentSummary,
  type AdministrativeDocumentTypeMetadata,
  type AdministrativeDossierCapabilities,
  type AdministrativeRequirementSummary,
} from "../../../../../../../lib/administrative-dossier-types";

type AvailableDocument = { id: string; title: string };

function RequirementRow({
  tenderId,
  requirement,
  canValidate,
  onChanged,
}: {
  tenderId: string;
  requirement: AdministrativeRequirementSummary;
  canValidate: boolean;
  onChanged: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function decide(action: "CONFIRM" | "REJECT" | "NOT_APPLICABLE") {
    setIsPending(true);
    setError(undefined);
    const fn = action === "CONFIRM" ? confirmAdministrativeRequirementAction : action === "REJECT" ? rejectAdministrativeRequirementAction : markAdministrativeRequirementNotApplicableAction;
    const result = await fn(tenderId, requirement.id);
    setIsPending(false);
    if (result.error) setError(result.error);
    else onChanged();
  }

  return (
    <li className="flex flex-col gap-1 rounded border border-neutral-200 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-neutral-900">
          {requirement.title} {requirement.required ? <span className="text-xs text-neutral-500">(obligatoire)</span> : null}
        </span>
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">{requirement.validationStatus}</span>
      </div>
      {requirement.validationStatus === "SUGGESTED" ? (
        canValidate ? (
          <div className="flex gap-2">
            <button type="button" disabled={isPending} onClick={() => decide("CONFIRM")} className="rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
              Confirmer
            </button>
            <button type="button" disabled={isPending} onClick={() => decide("REJECT")} className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 disabled:opacity-50">
              Rejeter
            </button>
            <button type="button" disabled={isPending} onClick={() => decide("NOT_APPLICABLE")} className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 disabled:opacity-50">
              Non applicable
            </button>
          </div>
        ) : (
          <p className="text-xs text-neutral-500" title="Vous n'avez pas les droits nécessaires pour valider une exigence">
            En attente de confirmation — droits de validation requis.
          </p>
        )
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function ChecklistLineRow({
  tenderId,
  requirement,
  state,
  canEdit,
  canValidate,
  availableDocuments,
  onChanged,
}: {
  tenderId: string;
  requirement: AdministrativeRequirementSummary;
  state: string;
  canEdit: boolean;
  canValidate: boolean;
  availableDocuments: AvailableDocument[];
  onChanged: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [document, setDocument] = useState<AdministrativeDocumentSummary | undefined>();
  const [expanded, setExpanded] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");

  async function expand() {
    setExpanded((v) => !v);
    if (!requirement.matchedDocumentId || document) return;
    const result = await getAdministrativeDocumentAction(requirement.matchedDocumentId);
    if (result.document) setDocument(result.document);
  }

  async function handleCreateDocument() {
    setIsPending(true);
    setError(undefined);
    const result = await createAdministrativeDocumentAction(tenderId, { documentType: requirement.expectedDocumentType, label: requirement.title, requirementId: requirement.id });
    setIsPending(false);
    if (result.error) setError(result.error);
    else onChanged();
  }

  async function handleAttach() {
    if (!requirement.matchedDocumentId || !selectedDocumentId) return;
    setIsPending(true);
    setError(undefined);
    const result = await attachAdministrativeDocumentRevisionAction(tenderId, requirement.matchedDocumentId, { documentId: selectedDocumentId });
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setDocument(result.document);
      onChanged();
    }
  }

  async function handleValidate(revisionId: string) {
    if (!requirement.matchedDocumentId) return;
    setIsPending(true);
    setError(undefined);
    const result = await validateAdministrativeDocumentAction(tenderId, requirement.matchedDocumentId, revisionId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      onChanged();
      setDocument(undefined);
    }
  }

  async function handleReject(revisionId: string) {
    if (!requirement.matchedDocumentId) return;
    setIsPending(true);
    setError(undefined);
    const result = await rejectAdministrativeDocumentAction(tenderId, requirement.matchedDocumentId, revisionId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      onChanged();
      setDocument(undefined);
    }
  }

  async function handleSetSignatureMode(mode: string) {
    if (!requirement.matchedDocumentId) return;
    setIsPending(true);
    setError(undefined);
    const result = await setAdministrativeDocumentSignatureModeAction(tenderId, requirement.matchedDocumentId, mode);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setDocument(result.document);
      onChanged();
    }
  }

  async function handleRecordSignature() {
    if (!requirement.matchedDocumentId) return;
    setIsPending(true);
    setError(undefined);
    const result = await recordAdministrativeDocumentSignatureAction(tenderId, requirement.matchedDocumentId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setDocument(result.document);
      onChanged();
    }
  }

  const latestRevision = document?.revisions[document.revisions.length - 1];

  return (
    <li className="flex flex-col gap-2 rounded border border-neutral-200 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-neutral-900">{requirement.title}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${administrativeChecklistStateBadgeClass(state)}`}>{ADMINISTRATIVE_CHECKLIST_STATE_LABELS[state] ?? state}</span>
      </div>

      {canEdit ? (
        <button type="button" onClick={expand} className="w-fit text-xs text-neutral-600 underline">
          {expanded ? "Masquer" : "Gérer la pièce"}
        </button>
      ) : null}

      {expanded ? (
        <div className="flex flex-col gap-2 rounded bg-neutral-50 p-2">
          {!requirement.matchedDocumentId ? (
            <button type="button" disabled={isPending || !canEdit} onClick={handleCreateDocument} className="w-fit rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
              Créer la pièce
            </button>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <select value={selectedDocumentId} onChange={(e) => setSelectedDocumentId(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs" aria-label="Document déjà téléversé à attacher">
                  <option value="">Choisir un document déjà téléversé…</option>
                  {availableDocuments.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={isPending || !canEdit || !selectedDocumentId} onClick={handleAttach} className="rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
                  Attacher
                </button>
              </div>
              {latestRevision ? (
                <div className="flex items-center justify-between gap-2 text-xs text-neutral-700">
                  <span>
                    Révision #{latestRevision.revisionNumber} — {latestRevision.status} {latestRevision.documentFileName ? `(${latestRevision.documentFileName})` : ""}
                  </span>
                  {canValidate && (latestRevision.status === "IN_REVIEW" || latestRevision.status === "DRAFT") && latestRevision.documentId ? (
                    <span className="flex gap-2">
                      <button type="button" disabled={isPending} onClick={() => handleValidate(latestRevision.id)} className="rounded bg-emerald-700 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
                        Valider
                      </button>
                      <button type="button" disabled={isPending} onClick={() => handleReject(latestRevision.id)} className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 disabled:opacity-50">
                        Rejeter
                      </button>
                    </span>
                  ) : null}
                </div>
              ) : null}
              {document ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-2 text-xs text-neutral-700">
                  <span>
                    Signature : <span className="font-medium">{ADMINISTRATIVE_SIGNATURE_MODE_LABELS[document.signatureMode] ?? document.signatureMode}</span> —{" "}
                    {ADMINISTRATIVE_SIGNATURE_STATUS_LABELS[document.signatureStatus] ?? document.signatureStatus}
                  </span>
                  {canEdit && document.signatureMode === "NOT_REQUIRED" ? (
                    <button type="button" disabled={isPending} onClick={() => handleSetSignatureMode("MANUAL")} className="rounded border border-neutral-300 px-2 py-1 text-xs">
                      Exiger une signature manuelle
                    </button>
                  ) : null}
                  {canEdit && document.signatureStatus === "PENDING" ? (
                    <button type="button" disabled={isPending} onClick={handleRecordSignature} className="rounded bg-emerald-700 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
                      Enregistrer la signature
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function AdministrativeChecklistSection({
  tenderId,
  checklist,
  requirements,
  capabilities,
  availableDocuments,
  documentTypes,
}: {
  tenderId: string;
  checklist: AdministrativeChecklist;
  requirements: AdministrativeRequirementSummary[];
  capabilities: AdministrativeDossierCapabilities;
  availableDocuments: AvailableDocument[];
  documentTypes: AdministrativeDocumentTypeMetadata[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState(documentTypes[0]?.code ?? "OTHER");
  const [required, setRequired] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>();

  function onChanged() {
    router.refresh();
  }

  async function handleCreateRequirement() {
    if (!title.trim()) {
      setCreateError("Le titre est obligatoire.");
      return;
    }
    setIsCreating(true);
    setCreateError(undefined);
    const result = await createAdministrativeRequirementAction(tenderId, { title, requirementType: "DOCUMENT", expectedDocumentType: documentType, required });
    setIsCreating(false);
    if (result.error) setCreateError(result.error);
    else {
      setTitle("");
      router.refresh();
    }
  }

  const requirementsByLine = new Map(requirements.map((r) => [r.id, r]));

  return (
    <div className="flex flex-col gap-6">
      {capabilities.canEdit ? (
        <section className="rounded border border-neutral-200 p-3">
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Ajouter une exigence</h2>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-neutral-600">
              Titre
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-600">
              Type de pièce attendu
              <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-sm">
                {documentTypes.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-neutral-600">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
              Obligatoire
            </label>
            <button type="button" disabled={isCreating} onClick={handleCreateRequirement} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              Ajouter
            </button>
          </div>
          {createError ? (
            <p role="alert" className="mt-1 text-xs text-red-700">
              {createError}
            </p>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Exigences en attente de confirmation</h2>
        <ul className="flex flex-col gap-2">
          {requirements
            .filter((r) => r.validationStatus === "SUGGESTED")
            .map((requirement) => (
              <RequirementRow key={requirement.id} tenderId={tenderId} requirement={requirement} canValidate={capabilities.canValidate} onChanged={onChanged} />
            ))}
          {requirements.filter((r) => r.validationStatus === "SUGGESTED").length === 0 ? <p className="text-sm text-neutral-500">Aucune exigence en attente.</p> : null}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Checklist ({checklist.completionPercentage}%)</h2>
        <ul className="flex flex-col gap-2">
          {checklist.lines.map((line) => {
            const requirement = requirementsByLine.get(line.requirementId);
            if (!requirement) return null;
            return (
              <ChecklistLineRow
                key={line.requirementId}
                tenderId={tenderId}
                requirement={requirement}
                state={line.state}
                canEdit={capabilities.canEdit}
                canValidate={capabilities.canValidate}
                availableDocuments={availableDocuments}
                onChanged={onChanged}
              />
            );
          })}
          {checklist.lines.length === 0 ? <p className="text-sm text-neutral-500">Aucune exigence confirmée pour l&apos;instant.</p> : null}
        </ul>
      </section>
    </div>
  );
}
