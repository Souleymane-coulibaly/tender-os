import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import { fetchAnalysisCapabilities, fetchAnalysisSectionData } from "../../../analysis-actions";
import { canTriggerAnalysis, type AnalysisCapability, type AnalysisSectionData } from "../../../../../lib/analysis-types";
import { fetchTenderSuggestions } from "../../../ai-suggestion-actions";
import { canManageAiSuggestions, type AiSuggestion } from "../../../../../lib/ai-suggestion-types";
import { fetchDceSectionData } from "../../../dce-actions";
import { canDeleteDceDocument, canImportOrReplaceDceDocument, type DceDocumentSummary, type DceSummary } from "../../../../../lib/dce-types";
import type { TenderCockpit } from "../../../../../lib/cockpit-types";
import { canUploadOrEditDocument, type DocumentSummary } from "../../../../../lib/documents-types";
import type { ClientAccountSummary, ClientPortfolioPage } from "../../../../../lib/client-portfolio-types";
import {
  TENDER_STATUS_LABELS,
  canChangeTenderCandidate,
  canEditTenderDetails,
  canManageTenderLots,
  type Alert,
  type AwardCriterion,
  type Buyer,
  type ChecklistItem,
  type Milestone,
  type Readiness,
  type RequestedDocument,
  type Risk,
  type StatusHistoryEntry,
  type Tender,
  type TenderLot,
  type TenderProfile,
} from "../../../../../lib/tenders-types";
import { ApiErrorState } from "../../api-error-state";
import { TenderStatusBadge } from "../tender-status-badge";
import { AiSuggestionsSection } from "./ai-suggestions-section";
import { AlertsSection } from "./alerts-section";
import { AnalysisSection } from "./analysis-section";
import { ArchiveButton } from "./archive-button";
import { CandidateSection } from "./candidate-section";
import { ChecklistSection } from "./checklist-section";
import { CockpitSection } from "./cockpit-section";
import { CompletenessSection } from "./completeness-section";
import { CriteriaSection } from "./criteria-section";
import { DceSection } from "./dce-section";
import { DocumentsSection } from "./documents-section";
import { EditTenderForm } from "./edit-tender-form";
import { LotsSection } from "./lots-section";
import { MilestonesSection } from "./milestones-section";
import { RequestedDocumentsSection } from "./requested-documents-section";
import { RestoreButton } from "./restore-button";
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
  let documents: DocumentSummary[];
  let dceSection: { dce: DceSummary | null; documents: DceDocumentSummary[] };
  let analysisData: AnalysisSectionData;
  let analysisCapabilities: AnalysisCapability[];
  let aiSuggestions: AiSuggestion[];
  let role: string | undefined;
  let cockpit: TenderCockpit;
  let profile: TenderProfile;
  let buyers: Buyer[];
  let accessibleClients: ClientAccountSummary[];

  try {
    [
      tender,
      lots,
      checklistItems,
      criteria,
      requestedDocuments,
      milestones,
      risks,
      alerts,
      readiness,
      history,
      documents,
      dceSection,
      analysisData,
      analysisCapabilities,
      aiSuggestions,
      role,
      cockpit,
      profile,
      buyers,
      accessibleClients,
    ] = await Promise.all([
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
      appApiFetch<DocumentSummary[]>(`/api/v1/tenders/${id}/documents`),
      fetchDceSectionData(id),
      fetchAnalysisSectionData(id),
      fetchAnalysisCapabilities(id),
      fetchTenderSuggestions(id),
      getCurrentMembershipRole(),
      appApiFetch<TenderCockpit>(`/api/v1/tenders/${id}/cockpit`),
      appApiFetch<TenderProfile>(`/api/v1/tenders/${id}/profile`),
      appApiFetch<Buyer[]>("/api/v1/buyers"),
      appApiFetch<ClientPortfolioPage<ClientAccountSummary>>("/api/v1/clients?limit=100&status=ACTIVE").then((page) => page.items),
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
          <Link href={`/app/clients/${tender.clientAccountId}`} className="text-sm text-neutral-700 hover:underline">
            Voir le client →
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <TenderStatusBadge status={tender.status} />
          {tender.status !== "ARCHIVED" ? <ArchiveButton tenderId={tender.id} /> : <RestoreButton tenderId={tender.id} />}
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-neutral-200 pb-3 text-sm">
        <Link href={`/app/tenders/${tender.id}/generations`} className="rounded px-2 py-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">
          Générations
        </Link>
        <Link href={`/app/tenders/${tender.id}/deliverables`} className="rounded px-2 py-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">
          Livrables
        </Link>
        <Link href={`/app/tenders/${tender.id}/administrative-dossier`} className="rounded px-2 py-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">
          Dossier administratif
        </Link>
        <Link href={`/app/tenders/${tender.id}/pricing`} className="rounded px-2 py-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">
          Pricing
        </Link>
        <Link href={`/app/tenders/${tender.id}/export`} className="rounded px-2 py-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">
          Export
        </Link>
        <Link href={`/app/tenders/${tender.id}/validation`} className="rounded px-2 py-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">
          Validation
        </Link>
        <Link href={`/app/tenders/${tender.id}/signature`} className="rounded px-2 py-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">
          Signature
        </Link>
        <Link href={`/app/tenders/${tender.id}/submission-package`} className="rounded px-2 py-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">
          Dossier de soumission
        </Link>
        <Link href={`/app/tenders/${tender.id}/submission`} className="rounded px-2 py-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">
          Dépôt
        </Link>
      </nav>

      <CockpitSection tenderId={tender.id} cockpit={cockpit} />

      <CompletenessSection completeness={profile.completeness} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <CandidateSection
          tenderId={tender.id}
          status={tender.status}
          currentClientAccountId={tender.clientAccountId}
          currentClientName={profile.candidate.name}
          accessibleClients={accessibleClients}
          canChange={canChangeTenderCandidate(role)}
        />
        <section className="rounded border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold text-neutral-700">Acheteur</h2>
          {profile.buyer ? (
            <div className="mt-1 text-sm text-neutral-900">
              <p className="font-medium">{profile.buyer.name}</p>
              {profile.buyer.city ? <p className="text-xs text-neutral-600">{profile.buyer.city}</p> : null}
              {profile.buyer.siret ? <p className="text-xs text-neutral-600">SIRET : {profile.buyer.siret}</p> : null}
            </div>
          ) : (
            <p className="mt-1 text-sm text-neutral-500">
              {tender.buyerName ?? "Aucun acheteur structure rattache."}
            </p>
          )}
          <p className="mt-2 text-xs text-neutral-500">
            Modifiable depuis « Modifier les informations de l&apos;appel d&apos;offres » ci-dessous.
          </p>
        </section>
      </div>

      {tender.status !== "ARCHIVED" ? <StatusChangeForm tenderId={tender.id} status={tender.status} /> : null}

      {canEditTenderDetails(role) ? (
        <details className="rounded border border-neutral-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-700">
            Modifier les informations de l&apos;appel d&apos;offres
          </summary>
          <div className="mt-4">
            <EditTenderForm tender={tender} buyers={buyers} />
          </div>
        </details>
      ) : null}

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
        <LotsSection tenderId={tender.id} lots={lots} canManage={canManageTenderLots(role)} />
        <ChecklistSection tenderId={tender.id} items={checklistItems} />
        <CriteriaSection tenderId={tender.id} criteria={criteria} />
        <RequestedDocumentsSection tenderId={tender.id} documents={requestedDocuments} />
        <DocumentsSection tenderId={tender.id} documents={documents} canManage={canUploadOrEditDocument(role)} />
        <DceSection
          tenderId={tender.id}
          dce={dceSection.dce}
          documents={dceSection.documents}
          canManage={canImportOrReplaceDceDocument(role)}
          canDelete={canDeleteDceDocument(role)}
          canAnalyze={canTriggerAnalysis(role)}
          analysisCapability={analysisCapabilities.find((c) => c.taskType === "ANALYZE_DOCUMENT")}
        />
        <MilestonesSection tenderId={tender.id} milestones={milestones} />
        <RisksSection tenderId={tender.id} risks={risks} />
        <AlertsSection tenderId={tender.id} alerts={alerts} />
        <AnalysisSection tenderId={tender.id} initialData={analysisData} canTrigger={canTriggerAnalysis(role)} />
        <AiSuggestionsSection tenderId={tender.id} initialSuggestions={aiSuggestions} canManage={canManageAiSuggestions(role)} />

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
