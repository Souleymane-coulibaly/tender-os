"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createChecklistPieceEntryAction,
  createComplianceMatrixEntryAction,
  createDeliverableAnnexAction,
  updateComplianceMatrixEntryAction,
} from "../../../../../deliverable-actions";
import { canManageDeliverable, type DeliverableSummary } from "../../../../../../../lib/deliverable-types";

type ComplianceEntry = { id: string; source: string; mandatory: boolean; criticality: string; coverageStatus: string; response?: string };
type ChecklistEntry = { id: string; name: string; mandatory: boolean; status: string };
type AnnexEntry = { id: string; label: string; status: string };

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
}: {
  tenderId: string;
  deliverable: DeliverableSummary;
  actorRole: string | undefined;
  complianceEntries?: ComplianceEntry[] | undefined;
  checklistEntries?: ChecklistEntry[] | undefined;
  annexEntries?: AnnexEntry[] | undefined;
}) {
  const canEdit = canManageDeliverable(actorRole);

  if (deliverable.type === "COMPLIANCE_MATRIX") return <ComplianceMatrixView tenderId={tenderId} deliverableId={deliverable.id} canEdit={canEdit} entries={complianceEntries ?? []} />;
  if (deliverable.type === "CHECKLIST") return <ChecklistView tenderId={tenderId} deliverableId={deliverable.id} canEdit={canEdit} entries={checklistEntries ?? []} />;
  return <AnnexesView tenderId={tenderId} deliverableId={deliverable.id} canEdit={canEdit} entries={annexEntries ?? []} />;
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
    const result = await updateComplianceMatrixEntryAction(tenderId, deliverableId, entryId, { response, coverageStatus: "COVERED" });
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
              <td className="py-2 pr-4 text-neutral-600">{entry.coverageStatus}</td>
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

function AnnexesView({ tenderId, deliverableId, canEdit, entries }: { tenderId: string; deliverableId: string; canEdit: boolean; entries: AnnexEntry[] }) {
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
          <li key={entry.id} className="flex items-center justify-between rounded border border-neutral-200 px-3 py-2 text-sm">
            <span>{entry.label}</span>
            <span className="text-xs text-neutral-500">{entry.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
