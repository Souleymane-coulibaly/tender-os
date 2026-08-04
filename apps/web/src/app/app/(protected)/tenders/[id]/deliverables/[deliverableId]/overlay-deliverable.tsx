"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createChecklistPieceEntryAction,
  createComplianceMatrixEntryAction,
  createDeliverableAnnexAction,
  updateComplianceMatrixEntryAction,
  updateDeliverableAnnexAction,
} from "../../../../../deliverable-actions";
import {
  canManageDeliverable,
  COMPLIANCE_COVERAGE_STATUSES,
  COMPLIANCE_COVERAGE_STATUS_LABELS,
  type DeliverableSummary,
} from "../../../../../../../lib/deliverable-types";

type ComplianceEntry = { id: string; source: string; mandatory: boolean; criticality: string; coverageStatus: string; response?: string };
type ChecklistEntry = { id: string; name: string; mandatory: boolean; status: string };
type AnnexEntry = { id: string; label: string; status: string };
type DocumentEntry = { id: string; title: string };

/** Mission Sprint 8A.1 §14 — Matrice de conformité/Checklist/Annexes : overlay léger, chaque
 *  entrée éditée directement, aucune révision/relecture séparée (décision de portée). Les données
 *  initiales viennent du serveur (`page.tsx`) — même convention que le reste du frontend
 *  (`ExportSection`/`GenerationSection`) : `router.refresh()` recharge les props après une mutation,
 *  jamais un second client de fetch côté navigateur. */
export function OverlayDeliverable({
  tenderId,
  deliverable,
  actorRole,
  complianceEntries,
  checklistEntries,
  annexEntries,
  availableDocuments,
}: {
  tenderId: string;
  deliverable: DeliverableSummary;
  actorRole: string | undefined;
  complianceEntries?: ComplianceEntry[] | undefined;
  checklistEntries?: ChecklistEntry[] | undefined;
  annexEntries?: AnnexEntry[] | undefined;
  availableDocuments?: DocumentEntry[] | undefined;
}) {
  const canEdit = canManageDeliverable(actorRole);

  if (deliverable.type === "COMPLIANCE_MATRIX") return <ComplianceMatrixView tenderId={tenderId} deliverableId={deliverable.id} canEdit={canEdit} entries={complianceEntries ?? []} />;
  if (deliverable.type === "CHECKLIST") return <ChecklistView tenderId={tenderId} deliverableId={deliverable.id} canEdit={canEdit} entries={checklistEntries ?? []} />;
  return <AnnexesView tenderId={tenderId} deliverableId={deliverable.id} canEdit={canEdit} entries={annexEntries ?? []} documents={availableDocuments ?? []} />;
}

function ComplianceMatrixView({ tenderId, deliverableId, canEdit, entries }: { tenderId: string; deliverableId: string; canEdit: boolean; entries: ComplianceEntry[] }) {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | undefined>();

  async function addEntry() {
    if (!source.trim()) return;
    const result = await createComplianceMatrixEntryAction(tenderId, deliverableId, { source: source.trim(), mandatory: true, criticality: "MEDIUM" });
    if (result.error) setError(result.error);
    else {
      setSource("");
      router.refresh();
    }
  }

  async function updateResponse(entryId: string, response: string) {
    const result = await updateComplianceMatrixEntryAction(tenderId, deliverableId, entryId, { response });
    if (result.error) setError(result.error);
    else router.refresh();
  }

  async function updateCoverage(entryId: string, coverageStatus: string) {
    const result = await updateComplianceMatrixEntryAction(tenderId, deliverableId, entryId, { coverageStatus });
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <div className="flex gap-2">
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Exigence (ex. CCTP art. 3.2)" className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm" />
          <button type="button" onClick={addEntry} className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white">
            Ajouter
          </button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="py-2 pr-4">Exigence</th>
            <th className="py-2 pr-4">Réponse</th>
            <th className="py-2 pr-4">Couverture</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-neutral-100">
              <td className="py-2 pr-4 text-neutral-700">{entry.source}</td>
              <td className="py-2 pr-4">
                {canEdit ? (
                  <input
                    defaultValue={entry.response ?? ""}
                    onBlur={(e) => (e.target.value !== entry.response ? updateResponse(entry.id, e.target.value) : undefined)}
                    className="w-full rounded border border-neutral-300 px-2 py-1"
                  />
                ) : (
                  entry.response
                )}
              </td>
              <td className="py-2 pr-4 text-neutral-600">
                {canEdit ? (
                  <select
                    value={entry.coverageStatus}
                    onChange={(e) => updateCoverage(entry.id, e.target.value)}
                    className="rounded border border-neutral-300 px-2 py-1"
                  >
                    {COMPLIANCE_COVERAGE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {COMPLIANCE_COVERAGE_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                ) : (
                  (COMPLIANCE_COVERAGE_STATUS_LABELS[entry.coverageStatus] ?? entry.coverageStatus)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChecklistView({ tenderId, deliverableId, canEdit, entries }: { tenderId: string; deliverableId: string; canEdit: boolean; entries: ChecklistEntry[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();

  async function addEntry() {
    if (!name.trim()) return;
    const result = await createChecklistPieceEntryAction(tenderId, deliverableId, { name: name.trim(), mandatory: true });
    if (result.error) setError(result.error);
    else {
      setName("");
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pièce (ex. attestation fiscale)" className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm" />
          <button type="button" onClick={addEntry} className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white">
            Ajouter
          </button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between rounded border border-neutral-200 px-3 py-2 text-sm">
            <span>{entry.name}</span>
            <span className="text-xs text-neutral-500">{entry.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnnexesView({
  tenderId,
  deliverableId,
  canEdit,
  entries,
  documents,
}: {
  tenderId: string;
  deliverableId: string;
  canEdit: boolean;
  entries: AnnexEntry[];
  documents: DocumentEntry[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | undefined>();

  async function addEntry() {
    if (!label.trim()) return;
    const result = await createDeliverableAnnexAction(tenderId, deliverableId, { label: label.trim() });
    if (result.error) setError(result.error);
    else {
      setLabel("");
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <div className="flex gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Annexe (ex. CV chef de projet)" className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm" />
          <button type="button" onClick={addEntry} className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white">
            Ajouter
          </button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <AnnexRow key={entry.id} tenderId={tenderId} deliverableId={deliverableId} canEdit={canEdit} entry={entry} documents={documents} />
        ))}
      </ul>
    </div>
  );
}

/** Mission — correctif "aucun moyen de faire avancer le statut d'une annexe" : le seul chemin réel
 *  (`UpdateDeliverableAnnexUseCase`, backend) exige un document vérifié — jamais une bascule de
 *  statut sans preuve réelle. Proposé uniquement tant que l'annexe est PENDING : une fois un
 *  document attaché, le statut passe à PROVIDED côté serveur et ce sélecteur disparaît. */
function AnnexRow({
  tenderId,
  deliverableId,
  canEdit,
  entry,
  documents,
}: {
  tenderId: string;
  deliverableId: string;
  canEdit: boolean;
  entry: AnnexEntry;
  documents: DocumentEntry[];
}) {
  const router = useRouter();
  const [documentId, setDocumentId] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function attach() {
    if (!documentId) return;
    setIsPending(true);
    const result = await updateDeliverableAnnexAction(tenderId, deliverableId, entry.id, { documentId });
    setIsPending(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <li className="flex flex-col gap-2 rounded border border-neutral-200 px-3 py-2 text-sm">
      <div className="flex items-center justify-between">
        <span>{entry.label}</span>
        <span className="text-xs text-neutral-500">{entry.status}</span>
      </div>
      {canEdit && entry.status === "PENDING" ? (
        documents.length > 0 ? (
          <div className="flex gap-2">
            <select value={documentId} onChange={(e) => setDocumentId(e.target.value)} className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs">
              <option value="">Choisir un document déjà déposé…</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={attach}
              disabled={!documentId || isPending}
              className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-100 disabled:opacity-50"
            >
              {isPending ? "Attachement..." : "Attacher"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-neutral-500">Aucun document disponible — déposez-en un dans Documents.</p>
        )
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </li>
  );
}
