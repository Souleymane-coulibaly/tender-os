import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, Button, Card, PageHeader } from "../../../../../components/ui";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import {
  canManageOpportunity,
  canPromoteOpportunity,
  canRecordGoNoGoDecision,
  OPPORTUNITY_SOURCE_LABELS,
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_STATUS_TONE,
  type GoNoGoDecision,
  type Opportunity,
  type OpportunityQuickScore,
} from "../../../../../lib/opportunity-types";
import { fetchOpportunityDecisions, fetchOpportunityQuickScore } from "../../../opportunity-actions";
import { canManageCandidateCompany, type CandidateCompanySummary } from "../../../../../lib/candidate-company-types";
import { fetchCandidateCompanies, resolveCandidateCompany } from "../../../candidate-company-actions";
import { ApiErrorState } from "../../api-error-state";
import { ArchiveOpportunityButton } from "./archive-opportunity-button";
import { OpportunityCandidateCompanySection } from "./candidate-company-section";
import { OpportunityDecisionSection } from "./opportunity-decision-section";
import { OpportunityQuickScoreSection } from "./opportunity-quick-score-section";
import { OpportunityStatusForm } from "./opportunity-status-form";
import { PromoteOpportunityButton } from "./promote-opportunity-button";

export const metadata: Metadata = { title: "Détail de l'opportunité — TenderOS" };

/** Libellé d'un champ de la fiche (grille de la carte d'informations). */
const FIELD_LABEL_CLASSES = "text-xs font-semibold uppercase tracking-wide text-tenderos-slate";

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

  // Checkpoint CCV2-G.1 — meme resolution tri-etat que la fiche Tender. L'Opportunity n'exige PAS
  // encore d'entreprise candidate (c'est un objet de qualification, pas un Tender exploitable) :
  // seule la PROMOTION l'exige. On distingue neanmoins « aucune » d'« illisible », pour ne jamais
  // proposer d'ecraser une attribution valide a cause d'une panne passagere.
  const candidateResolution = await resolveCandidateCompany(opportunity.candidateCompanyId);
  const currentCandidateCompany = candidateResolution.kind === "loaded" ? candidateResolution.company : null;

  const canManage = canManageOpportunity(role);
  const canDecide = canRecordGoNoGoDecision(role);
  // Checkpoint TENDEROS-2.1 (correctif UX) — miroir EXACT de `ALLOWED_OPPORTUNITY_TRANSITIONS`
  // (backend, `opportunity-status.ts`) pour les seules cibles GO/GO_CONDITIONAL/NO_GO : autorisées
  // depuis QUALIFIED, ou depuis une décision déjà prise (une nouvelle décision reste toujours
  // possible). Confort UX uniquement — le backend reste l'autorité et revalide systématiquement.
  const decisionAllowedFromStatus = ["QUALIFIED", "GO", "GO_CONDITIONAL", "NO_GO"].includes(opportunity.status);
  const canPromote = canPromoteOpportunity(role) && (opportunity.status === "GO" || opportunity.status === "GO_CONDITIONAL");
  const canArchive = canManage && opportunity.status !== "ARCHIVED" && opportunity.status !== "PROMOTED";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Opportunités", href: "/app/opportunities" }, { label: opportunity.title }]}
        title={opportunity.title}
        description={
          <>
            {opportunity.buyerName ?? "Acheteur non renseigné"} — {OPPORTUNITY_SOURCE_LABELS[opportunity.source]}
            {opportunity.clientAccountId ? null : (
              <span className="mt-1 block italic text-warning-fg">Aucun client rattaché — score et décision restent possibles, avec confiance réduite.</span>
            )}
          </>
        }
        status={<Badge tone={OPPORTUNITY_STATUS_TONE[opportunity.status]}>{OPPORTUNITY_STATUS_LABELS[opportunity.status]}</Badge>}
        actions={
          opportunity.clientAccountId || canArchive ? (
            <>
              {opportunity.clientAccountId ? (
                <Button href={`/app/clients/${opportunity.clientAccountId}`} variant="link" className="text-sm">
                  Voir le client →
                </Button>
              ) : null}
              {canArchive ? <ArchiveOpportunityButton opportunityId={opportunity.id} /> : null}
            </>
          ) : undefined
        }
      />

      {opportunity.status === "PROMOTED" && opportunity.tenderId ? (
        <Alert tone="info">
          Cette opportunité a été promue en appel d&apos;offres.{" "}
          <Link href={`/app/tenders/${opportunity.tenderId}`} className="font-semibold underline">
            Voir l&apos;appel d&apos;offres →
          </Link>
        </Alert>
      ) : null}

      <Card>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <h2 className={FIELD_LABEL_CLASSES}>Secteur</h2>
            <p className="text-sm text-tenderos-navy">{opportunity.sector ?? "—"}</p>
          </div>
          <div>
            <h2 className={FIELD_LABEL_CLASSES}>Localisation</h2>
            <p className="text-sm text-tenderos-navy">{opportunity.location ?? "—"}</p>
          </div>
          <div>
            <h2 className={FIELD_LABEL_CLASSES}>Date limite de dépôt</h2>
            <p className="text-sm text-tenderos-navy">{opportunity.submissionDeadline ? new Date(opportunity.submissionDeadline).toLocaleDateString("fr-FR") : "—"}</p>
          </div>
          <div>
            <h2 className={FIELD_LABEL_CLASSES}>Montant estimé</h2>
            <p className="text-sm text-tenderos-navy">{opportunity.estimatedAmount ? `${opportunity.estimatedAmount} ${opportunity.currency ?? ""}` : "—"}</p>
          </div>
          <div>
            <h2 className={FIELD_LABEL_CLASSES}>Type de procédure</h2>
            <p className="text-sm text-tenderos-navy">{opportunity.procedureType ?? "—"}</p>
          </div>
          <div>
            <h2 className={FIELD_LABEL_CLASSES}>Référence externe</h2>
            <p className="text-sm text-tenderos-navy">{opportunity.externalReference ?? "—"}</p>
          </div>
          <OpportunityCandidateCompanySection
            opportunityId={opportunity.id}
            currentCandidateCompany={currentCandidateCompany}
            availableCandidateCompanies={availableCandidateCompanies}
            canManage={canManage && canManageCandidateCompany(role)}
          />
        </div>
      </Card>

      {canManage && opportunity.status !== "ARCHIVED" ? <OpportunityStatusForm opportunityId={opportunity.id} status={opportunity.status} /> : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <OpportunityQuickScoreSection opportunityId={opportunity.id} initialScore={quickScore} canCompute={canManage} />
        <OpportunityDecisionSection
          opportunityId={opportunity.id}
          initialDecisions={decisions}
          canDecide={canDecide}
          decisionAllowedFromStatus={decisionAllowedFromStatus}
          latestQuickScoreId={quickScore?.id}
        />
      </div>

      {canPromote ? (
        <PromoteOpportunityButton opportunityId={opportunity.id} hasCandidateCompany={Boolean(opportunity.candidateCompanyId)} />
      ) : opportunity.status === "GO" || opportunity.status === "GO_CONDITIONAL" ? (
        <p className="text-xs text-tenderos-slate">La promotion en appel d&apos;offres est réservée aux rôles OWNER / ADMIN / BID_MANAGER.</p>
      ) : null}
    </div>
  );
}
