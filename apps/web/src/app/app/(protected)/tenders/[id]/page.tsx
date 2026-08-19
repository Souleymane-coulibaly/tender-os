import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import { FirstTenderTracker } from "./first-tender-tracker";
import { fetchTenderSuggestions } from "../../../ai-suggestion-actions";
import { canManageAiSuggestions, type AiSuggestion } from "../../../../../lib/ai-suggestion-types";
import { fetchGoNoGoReport, fetchTenderGoNoGoDecisions } from "../../../opportunity-actions";
import { canGenerateGoNoGoReport, canRecordGoNoGoDecision, type GoNoGoDecision, type GoNoGoReport } from "../../../../../lib/opportunity-types";
import type { TenderCockpit } from "../../../../../lib/cockpit-types";
import { canUploadOrEditDocument, type DocumentSummary } from "../../../../../lib/documents-types";
import type { ClientAccountSummary, ClientPortfolioPage } from "../../../../../lib/client-portfolio-types";
import { fetchCandidateCompanies, fetchCandidateCompanyOrNull } from "../../../candidate-company-actions";
import type { CandidateCompanySummary } from "../../../../../lib/candidate-company-types";
import {
  TENDER_STATUS_LABELS,
  canChangeTenderCandidateCompany,
  canChangeTenderClient,
  canEditTenderDetails,
  canManageTenderLots,
  type Alert,
  type AwardCriterion,
  type Buyer,
  type Milestone,
  type Readiness,
  type RequestedDocument,
  type Risk,
  type StatusHistoryEntry,
  type Tender,
  type TenderLot,
  type TenderProfile,
} from "../../../../../lib/tenders-types";
import { Badge, type BadgeTone } from "../../../../../components/ui/badge";
import { Card } from "../../../../../components/ui/card";
import { PageHeader } from "../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../api-error-state";
import { TenderStatusBadge } from "../tender-status-badge";
import { AiSuggestionsSection } from "./ai-suggestions-section";
import { AlertsSection } from "./alerts-section";
import { ArchiveButton } from "./archive-button";
import { CandidateCompanySection } from "./candidate-company-section";
import { ClientSection } from "./client-section";
import { CockpitSection } from "./cockpit-section";
import { CompletenessSection } from "./completeness-section";
import { CriteriaSection } from "./criteria-section";
import { DocumentsSection } from "./documents-section";
import { EditTenderForm } from "./edit-tender-form";
import { GoNoGoSection } from "./go-no-go-section";
import { LotsSection } from "./lots-section";
import { MilestonesSection } from "./milestones-section";
import { RequestedDocumentsSection } from "./requested-documents-section";
import { RestoreButton } from "./restore-button";
import { RisksSection } from "./risks-section";
import { StatusChangeForm } from "./status-change-form";
import { buildTenderNavTabs } from "./tender-nav-tabs";

export const metadata: Metadata = { title: "Detail de l'appel d'offres — TenderOS" };

function readinessTone(status: Readiness["status"]): BadgeTone {
  switch (status) {
    case "READY":
      return "success";
    case "READY_WITH_WARNINGS":
      return "warning";
    case "IN_PROGRESS":
      return "info";
    default:
      return "danger";
  }
}

export default async function TenderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let tender: Tender;
  let lots: TenderLot[];
  let criteria: AwardCriterion[];
  let requestedDocuments: RequestedDocument[];
  let milestones: Milestone[];
  let risks: Risk[];
  let alerts: Alert[];
  let readiness: Readiness;
  let history: StatusHistoryEntry[];
  let documents: DocumentSummary[];
  let aiSuggestions: AiSuggestion[];
  let role: string | undefined;
  let cockpit: TenderCockpit;
  let profile: TenderProfile;
  let buyers: Buyer[];
  let accessibleClients: ClientAccountSummary[];
  let goNoGoReport: GoNoGoReport | null;
  let goNoGoDecisions: GoNoGoDecision[];
  let availableCandidateCompanies: CandidateCompanySummary[];

  try {
    [
      tender,
      lots,
      criteria,
      requestedDocuments,
      milestones,
      risks,
      alerts,
      readiness,
      history,
      documents,
      aiSuggestions,
      role,
      cockpit,
      profile,
      buyers,
      accessibleClients,
      goNoGoReport,
      goNoGoDecisions,
      availableCandidateCompanies,
    ] = await Promise.all([
      appApiFetch<Tender>(`/api/v1/tenders/${id}`),
      appApiFetch<TenderLot[]>(`/api/v1/tenders/${id}/lots`),
      appApiFetch<AwardCriterion[]>(`/api/v1/tenders/${id}/criteria`),
      appApiFetch<RequestedDocument[]>(`/api/v1/tenders/${id}/requested-documents`),
      appApiFetch<Milestone[]>(`/api/v1/tenders/${id}/milestones`),
      appApiFetch<Risk[]>(`/api/v1/tenders/${id}/risks`),
      appApiFetch<Alert[]>(`/api/v1/tenders/${id}/alerts`),
      appApiFetch<Readiness>(`/api/v1/tenders/${id}/readiness`),
      appApiFetch<StatusHistoryEntry[]>(`/api/v1/tenders/${id}/history`),
      appApiFetch<DocumentSummary[]>(`/api/v1/tenders/${id}/documents`),
      fetchTenderSuggestions(id),
      getCurrentMembershipRole(),
      appApiFetch<TenderCockpit>(`/api/v1/tenders/${id}/cockpit`),
      appApiFetch<TenderProfile>(`/api/v1/tenders/${id}/profile`),
      appApiFetch<Buyer[]>("/api/v1/buyers"),
      appApiFetch<ClientPortfolioPage<ClientAccountSummary>>("/api/v1/clients?limit=100&status=ACTIVE").then((page) => page.items),
      fetchGoNoGoReport(id),
      fetchTenderGoNoGoDecisions(id),
      fetchCandidateCompanies().then((page) => page.items),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  // Checkpoint 2.1-A5 — best-effort, jamais bloquant (même discipline que ResolveCandidateIdentityUseCase
  // côté backend) : un Tender legacy (candidateCompanyId absent) ou une CandidateCompany depuis
  // archivée ne doit jamais faire échouer l'affichage de la fiche Tender.
  const currentCandidateCompany = tender.candidateCompanyId ? await fetchCandidateCompanyOrNull(tender.candidateCompanyId) : null;

  const navTabs = buildTenderNavTabs(tender.id);

  return (
    <div className="flex flex-col gap-6">
      <FirstTenderTracker />
      <PageHeader
        breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: tender.title }]}
        title={tender.title}
        description={`${tender.reference ? `${tender.reference} — ` : ""}${tender.buyerName ?? "Acheteur non renseigné"}`}
        status={<TenderStatusBadge status={tender.status} />}
        actions={
          <>
            <Link href={`/app/clients/${tender.clientAccountId}`} className="text-sm font-medium text-tenderos-blue hover:underline">
              Voir le client
            </Link>
            {tender.status !== "ARCHIVED" ? <ArchiveButton tenderId={tender.id} /> : <RestoreButton tenderId={tender.id} />}
          </>
        }
      />

      <TabsNav items={navTabs} activeHref={`/app/tenders/${tender.id}`} />

      <CockpitSection tenderId={tender.id} cockpit={cockpit} />

      <CompletenessSection completeness={profile.completeness} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ClientSection
          tenderId={tender.id}
          status={tender.status}
          currentClientAccountId={tender.clientAccountId}
          currentClientName={profile.candidate.name}
          accessibleClients={accessibleClients}
          canChange={canChangeTenderClient(role)}
        />
        <CandidateCompanySection
          tenderId={tender.id}
          status={tender.status}
          currentCandidateCompany={currentCandidateCompany}
          availableCandidateCompanies={availableCandidateCompanies}
          canChange={canChangeTenderCandidateCompany(role)}
        />
      </div>

      <Card title="Acheteur">
        {profile.buyer ? (
          <div className="text-sm text-tenderos-navy">
            <p className="font-semibold">{profile.buyer.name}</p>
            {profile.buyer.city ? <p className="text-xs text-tenderos-slate">{profile.buyer.city}</p> : null}
            {profile.buyer.siret ? <p className="text-xs text-tenderos-slate">SIRET : {profile.buyer.siret}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-tenderos-slate">{tender.buyerName ?? "Aucun acheteur structuré rattaché."}</p>
        )}
        <p className="mt-2 text-xs text-tenderos-slate">Modifiable depuis « Modifier les informations de l&apos;appel d&apos;offres » ci-dessous.</p>
      </Card>

      {tender.status !== "ARCHIVED" ? <StatusChangeForm tenderId={tender.id} status={tender.status} /> : null}

      {canEditTenderDetails(role) ? (
        <details className="rounded-2xl border border-tenderos-navy/10 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer font-tenderos-display text-base font-bold text-tenderos-navy">
            Modifier les informations de l&apos;appel d&apos;offres
          </summary>
          <div className="mt-4">
            <EditTenderForm tender={tender} buyers={buyers} />
          </div>
        </details>
      ) : null}

      <Card
        title="Score de préparation"
        actions={<Badge tone={readinessTone(readiness.status)}>{readiness.score}/100</Badge>}
      >
        <ul className="flex flex-col gap-1 text-xs text-tenderos-slate">
          {readiness.breakdown.map((entry) => (
            <li key={entry.label} className="flex justify-between">
              <span>{entry.label}</span>
              <span className="tabular-nums">{entry.points.toFixed(1)} / {entry.weight}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs italic text-tenderos-slate">{readiness.disclaimer}</p>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <LotsSection tenderId={tender.id} lots={lots} canManage={canManageTenderLots(role)} />
        <CriteriaSection tenderId={tender.id} criteria={criteria} />
        <RequestedDocumentsSection tenderId={tender.id} documents={requestedDocuments} />
        <DocumentsSection tenderId={tender.id} documents={documents} canManage={canUploadOrEditDocument(role)} />
        <MilestonesSection tenderId={tender.id} milestones={milestones} />
        <RisksSection tenderId={tender.id} risks={risks} />
        <AlertsSection tenderId={tender.id} alerts={alerts} />
        <AiSuggestionsSection tenderId={tender.id} initialSuggestions={aiSuggestions} canManage={canManageAiSuggestions(role)} />
        <GoNoGoSection
          tenderId={tender.id}
          initialReport={goNoGoReport}
          initialDecisions={goNoGoDecisions}
          canGenerate={canGenerateGoNoGoReport(role)}
          canDecide={canRecordGoNoGoDecision(role)}
        />

        <Card title="Historique">
          {history.length === 0 ? (
            <p className="text-sm text-tenderos-slate">Aucun changement de statut.</p>
          ) : (
            <ul className="flex flex-col">
              {history.map((entry) => (
                <li key={entry.id} className="border-b border-tenderos-navy/5 py-2 text-sm text-tenderos-navy last:border-b-0">
                  {entry.previousStatus ? TENDER_STATUS_LABELS[entry.previousStatus as keyof typeof TENDER_STATUS_LABELS] ?? entry.previousStatus : "—"}
                  {" → "}
                  {TENDER_STATUS_LABELS[entry.newStatus as keyof typeof TENDER_STATUS_LABELS] ?? entry.newStatus}
                  <span className="ml-2 text-xs text-tenderos-slate">
                    {new Date(entry.changedAt).toLocaleString("fr-FR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
