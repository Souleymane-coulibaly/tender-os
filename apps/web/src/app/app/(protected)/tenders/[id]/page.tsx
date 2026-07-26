import type { Metadata } from "next";
import { appApiFetch } from "../../../../../lib/app-api-client";
import {
  TENDER_STATUS_LABELS,
  type Alert,
  type AwardCriterion,
  type ChecklistItem,
  type Milestone,
  type Readiness,
  type RequestedDocument,
  type Risk,
  type StatusHistoryEntry,
  type Tender,
  type TenderLot,
} from "../../../../../lib/tenders-types";
import { ApiErrorState } from "../../api-error-state";
import { TenderStatusBadge } from "../tender-status-badge";
import { AlertsSection } from "./alerts-section";
import { ArchiveButton } from "./archive-button";
import { ChecklistSection } from "./checklist-section";
import { CriteriaSection } from "./criteria-section";
import { LotsSection } from "./lots-section";
import { MilestonesSection } from "./milestones-section";
import { RequestedDocumentsSection } from "./requested-documents-section";
import { RisksSection } from "./risks-section";
import { StatusChangeForm } from "./status-change-form";

export const metadata: Metadata = { title: "Detail de l'appel d'offres — TenderOS" };

function readinessBadgeClass(status: Readiness["status"]): string {
  switch (status) {
    case "READY":
      return "bg-green-100 text-green-800";
    case "READY_WITH_WARNINGS":
      return "bg-amber-100 text-amber-800";
    case "IN_PROGRESS":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-red-100 text-red-800";
  }
}

export default async function TenderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let tender: Tender;
  let lots: TenderLot[];
  let checklistItems: ChecklistItem[];
  let criteria: AwardCriterion[];
  let requestedDocuments: RequestedDocument[];
  let milestones: Milestone[];
  let risks: Risk[];
  let alerts: Alert[];
  let readiness: Readiness;
  let history: StatusHistoryEntry[];

  try {
    [tender, lots, checklistItems, criteria, requestedDocuments, milestones, risks, alerts, readiness, history] =
      await Promise.all([
        appApiFetch<Tender>(`/api/v1/tenders/${id}`),
        appApiFetch<TenderLot[]>(`/api/v1/tenders/${id}/lots`),
        appApiFetch<ChecklistItem[]>(`/api/v1/tenders/${id}/checklist`),
        appApiFetch<AwardCriterion[]>(`/api/v1/tenders/${id}/criteria`),
        appApiFetch<RequestedDocument[]>(`/api/v1/tenders/${id}/requested-documents`),
        appApiFetch<Milestone[]>(`/api/v1/tenders/${id}/milestones`),
        appApiFetch<Risk[]>(`/api/v1/tenders/${id}/risks`),
        appApiFetch<Alert[]>(`/api/v1/tenders/${id}/alerts`),
        appApiFetch<Readiness>(`/api/v1/tenders/${id}/readiness`),
        appApiFetch<StatusHistoryEntry[]>(`/api/v1/tenders/${id}/history`),
      ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{tender.title}</h1>
          <p className="text-sm text-neutral-600">
            {tender.reference ? `${tender.reference} — ` : null}
            {tender.buyerName ?? "Acheteur non renseigne"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TenderStatusBadge status={tender.status} />
          {tender.status !== "ARCHIVED" ? <ArchiveButton tenderId={tender.id} /> : null}
        </div>
      </div>

      {tender.status !== "ARCHIVED" ? <StatusChangeForm tenderId={tender.id} status={tender.status} /> : null}

      <section className="rounded border border-neutral-200 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">Score de preparation</h2>
          <span className={`rounded px-2 py-1 text-xs font-medium ${readinessBadgeClass(readiness.status)}`}>
            {readiness.score}/100
          </span>
        </div>
        <ul className="mt-2 flex flex-col gap-1 text-xs text-neutral-600">
          {readiness.breakdown.map((entry) => (
            <li key={entry.label} className="flex justify-between">
              <span>{entry.label}</span>
              <span>{entry.points.toFixed(1)} / {entry.weight}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs italic text-neutral-500">{readiness.disclaimer}</p>
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <LotsSection tenderId={tender.id} lots={lots} />
        <ChecklistSection tenderId={tender.id} items={checklistItems} />
        <CriteriaSection tenderId={tender.id} criteria={criteria} />
        <RequestedDocumentsSection tenderId={tender.id} documents={requestedDocuments} />
        <MilestonesSection tenderId={tender.id} milestones={milestones} />
        <RisksSection tenderId={tender.id} risks={risks} />
        <AlertsSection tenderId={tender.id} alerts={alerts} />

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-neutral-700">Historique</h2>
          {history.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucun changement de statut.</p>
          ) : (
            <ul>
              {history.map((entry) => (
                <li key={entry.id} className="border-b border-neutral-100 py-2 text-sm text-neutral-700">
                  {entry.previousStatus ? TENDER_STATUS_LABELS[entry.previousStatus as keyof typeof TENDER_STATUS_LABELS] ?? entry.previousStatus : "—"}
                  {" → "}
                  {TENDER_STATUS_LABELS[entry.newStatus as keyof typeof TENDER_STATUS_LABELS] ?? entry.newStatus}
                  <span className="ml-2 text-xs text-neutral-500">
                    {new Date(entry.changedAt).toLocaleString("fr-FR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
