import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import {
  canManageOpportunity,
  canPromoteOpportunity,
  canRecordGoNoGoDecision,
  OPPORTUNITY_SOURCE_LABELS,
  OPPORTUNITY_STATUS_BADGE_CLASSES,
  OPPORTUNITY_STATUS_LABELS,
  type GoNoGoDecision,
  type Opportunity,
  type OpportunityQuickScore,
} from "../../../../../lib/opportunity-types";
import { fetchOpportunityDecisions, fetchOpportunityQuickScore } from "../../../opportunity-actions";
import { canManageCandidateCompany, type CandidateCompanySummary } from "../../../../../lib/candidate-company-types";
import { fetchCandidateCompanies, fetchCandidateCompanyOrNull } from "../../../candidate-company-actions";
import { ApiErrorState } from "../../api-error-state";
import { ArchiveOpportunityButton } from "./archive-opportunity-button";
import { OpportunityCandidateCompanySection } from "./candidate-company-section";
import { OpportunityDecisionSection } from "./opportunity-decision-section";
import { OpportunityQuickScoreSection } from "./opportunity-quick-score-section";
import { OpportunityStatusForm } from "./opportunity-status-form";
import { PromoteOpportunityButton } from "./promote-opportunity-button";

export const metadata: Metadata = { title: "Détail de l'opportunité — TenderOS" };

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let opportunity: Opportunity;
  let quickScore: OpportunityQuickScore | null;
  let decisions: GoNoGoDecision[];
  let role: string | undefined;
  let availableCandidateCompanies: CandidateCompanySummary[];

  try {
    [opportunity, quickScore, decisions, role, availableCandidateCompanies] = await Promise.all([
      appApiFetch<Opportunity>(`/api/v1/opportunities/${id}`),
      fetchOpportunityQuickScore(id),
      fetchOpportunityDecisions(id),
      getCurrentMembershipRole(),
      fetchCandidateCompanies().then((page) => page.items),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  // Checkpoint 2.1-A5 — best-effort, jamais bloquant (voir la même discipline sur la fiche Tender).
  const currentCandidateCompany = opportunity.candidateCompanyId ? await fetchCandidateCompanyOrNull(opportunity.candidateCompanyId) : null;

  const canManage = canManageOpportunity(role);
  const canDecide = canRecordGoNoGoDecision(role);
  const canPromote = canPromoteOpportunity(role) && (opportunity.status === "GO" || opportunity.status === "GO_CONDITIONAL");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{opportunity.title}</h1>
          <p className="text-sm text-neutral-600">
            {opportunity.buyerName ?? "Acheteur non renseigné"} — {OPPORTUNITY_SOURCE_LABELS[opportunity.source]}
          </p>
          {opportunity.clientAccountId ? (
            <Link href={`/app/clients/${opportunity.clientAccountId}`} className="text-sm text-neutral-700 hover:underline">
              Voir le client →
            </Link>
          ) : (
            <p className="text-sm italic text-amber-700">Aucun client rattaché — score et décision restent possibles, avec confiance réduite.</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded px-2 py-1 text-xs font-medium ${OPPORTUNITY_STATUS_BADGE_CLASSES[opportunity.status]}`}>
            {OPPORTUNITY_STATUS_LABELS[opportunity.status]}
          </span>
          {canManage && opportunity.status !== "ARCHIVED" && opportunity.status !== "PROMOTED" ? <ArchiveOpportunityButton opportunityId={opportunity.id} /> : null}
        </div>
      </div>

      {opportunity.status === "PROMOTED" && opportunity.tenderId ? (
        <div className="rounded border border-purple-200 bg-purple-50 p-4 text-sm text-purple-800">
          Cette opportunité a été promue en appel d&apos;offres.{" "}
          <Link href={`/app/tenders/${opportunity.tenderId}`} className="underline">
            Voir l&apos;appel d&apos;offres →
          </Link>
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 rounded border border-neutral-200 p-4 md:grid-cols-3">
        <div>
          <h2 className="text-xs font-semibold uppercase text-neutral-500">Secteur</h2>
          <p className="text-sm text-neutral-900">{opportunity.sector ?? "—"}</p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase text-neutral-500">Localisation</h2>
          <p className="text-sm text-neutral-900">{opportunity.location ?? "—"}</p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase text-neutral-500">Date limite de dépôt</h2>
          <p className="text-sm text-neutral-900">{opportunity.submissionDeadline ? new Date(opportunity.submissionDeadline).toLocaleDateString("fr-FR") : "—"}</p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase text-neutral-500">Montant estimé</h2>
          <p className="text-sm text-neutral-900">{opportunity.estimatedAmount ? `${opportunity.estimatedAmount} ${opportunity.currency ?? ""}` : "—"}</p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase text-neutral-500">Type de procédure</h2>
          <p className="text-sm text-neutral-900">{opportunity.procedureType ?? "—"}</p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase text-neutral-500">Référence externe</h2>
          <p className="text-sm text-neutral-900">{opportunity.externalReference ?? "—"}</p>
        </div>
        <OpportunityCandidateCompanySection
          opportunityId={opportunity.id}
          currentCandidateCompany={currentCandidateCompany}
          availableCandidateCompanies={availableCandidateCompanies}
          canManage={canManage && canManageCandidateCompany(role)}
        />
      </section>

      {canManage && opportunity.status !== "ARCHIVED" ? <OpportunityStatusForm opportunityId={opportunity.id} status={opportunity.status} /> : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <OpportunityQuickScoreSection opportunityId={opportunity.id} initialScore={quickScore} canCompute={canManage} />
        <OpportunityDecisionSection opportunityId={opportunity.id} initialDecisions={decisions} canDecide={canDecide} latestQuickScoreId={quickScore?.id} />
      </div>

      {canPromote ? (
        <PromoteOpportunityButton opportunityId={opportunity.id} />
      ) : opportunity.status === "GO" || opportunity.status === "GO_CONDITIONAL" ? (
        <p className="text-xs text-neutral-500">La promotion en appel d&apos;offres est réservée aux rôles OWNER / ADMIN / BID_MANAGER.</p>
      ) : null}
    </div>
  );
}
