import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, PageHeader } from "../../../../../components/ui";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import {
  CLIENT_ACCOUNT_STATUS_LABELS,
  CLIENT_ACCOUNT_STATUS_TONE,
  type ClientAccountSummary,
  type ClientAssignmentView,
} from "../../../../../lib/client-portfolio-types";
import type { PageResponse, TenderListItem } from "../../../../../lib/tenders-types";
import type { KnowledgePage, KnowledgeEntrySummary } from "../../../../../lib/knowledge-types";
import type { ClientCostSummary } from "../../../../../lib/pricing-types";
import { isOrganizationAdmin } from "../../../../../lib/authorization";
import { ApiErrorState } from "../../api-error-state";
import { ClientAssignmentsSection } from "./client-assignments-section";
import { ClientLifecycleActions } from "./client-lifecycle-actions";
import { ClientPricingSection } from "./client-pricing-section";
import { ClientTendersSection } from "./client-tenders-section";
import { EditClientAccountForm } from "./edit-client-account-form";
import type { AssignableUser } from "./assign-user-form";

export const metadata: Metadata = { title: "Fiche client — TenderOS" };

type OrganizationMemberResponse = { userId: string; role: string; user: { id: string; email: string; displayName: string } };

/** Palier organisation UNIQUEMENT (mission §"OWNER/ADMIN : accès à tous les clients") — un
 *  CLIENT_MANAGER affecté peut aussi gérer les affectations côté backend (policy centralisée),
 *  mais cette UI ne résout pas encore l'identité du membre courant pour l'afficher dans ce cas
 *  précis (limite connue, voir le rapport final). Jamais un blocage de sécurité : le backend
 *  revalide toujours l'action réellement soumise, quelle que soit l'UI affichée ici.
 *  Checkpoint TENDEROS-2.1-P2.3-E6 — palier OWNER/ORGANIZATION_ADMIN converge vers lib/authorization.ts. */
const canManageAssignments = isOrganizationAdmin;

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let client: ClientAccountSummary;
  let assignments: ClientAssignmentView[];
  let members: PageResponse<OrganizationMemberResponse>;
  let tenders: PageResponse<TenderListItem>;
  let knowledge: KnowledgePage<KnowledgeEntrySummary>;
  let pricing: ClientCostSummary;
  let actorRole: string | undefined;

  try {
    [client, assignments, members, tenders, knowledge, pricing, actorRole] = await Promise.all([
      appApiFetch<ClientAccountSummary>(`/api/v1/clients/${id}`),
      appApiFetch<ClientAssignmentView[]>(`/api/v1/clients/${id}/assignments`),
      appApiFetch<PageResponse<OrganizationMemberResponse>>("/api/v1/organization-memberships?limit=100"),
      appApiFetch<PageResponse<TenderListItem>>(`/api/v1/tenders?clientAccountId=${id}&limit=5`),
      appApiFetch<KnowledgePage<KnowledgeEntrySummary>>(`/api/v1/knowledge/entries?clientAccountId=${id}&limit=1`),
      appApiFetch<ClientCostSummary>(`/api/v1/clients/${id}/pricing/summary`),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const assignedUserIds = new Set(assignments.map((assignment) => assignment.userId));
  const candidates: AssignableUser[] = members.items
    .filter((member) => !assignedUserIds.has(member.userId))
    .map((member) => ({ id: member.userId, email: member.user.email, displayName: member.user.displayName, role: member.role }));

  const canManage = canManageAssignments(actorRole);
  const canDelete = canManage;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Clients", href: "/app/clients" }, { label: client.name }]}
        title={client.name}
        status={<Badge tone={CLIENT_ACCOUNT_STATUS_TONE[client.status] ?? "neutral"}>{CLIENT_ACCOUNT_STATUS_LABELS[client.status]}</Badge>}
        actions={canManage ? <ClientLifecycleActions client={client} canDelete={canDelete} /> : undefined}
      />

      <Card title="Informations générales">
        <EditClientAccountForm client={client} disabled={client.status === "ARCHIVED"} />
      </Card>

      <Card
        title="Profil entreprise du client"
        actions={<Button href={`/app/clients/${client.id}/company-profile`}>Ouvrir la fiche →</Button>}
      >
        <p className="text-sm text-tenderos-slate">Identité légale, contacts, comptes bancaires, assurances, certifications, références et moyens.</p>
      </Card>

      <ClientAssignmentsSection clientId={client.id} assignments={assignments} candidates={candidates} canManage={canManage} />

      <ClientTendersSection clientId={client.id} tenders={tenders.items} hasMore={tenders.pageInfo.hasNextPage} />

      <Card title="Pricing & prévisions">
        <ClientPricingSection summary={pricing} />
      </Card>

      <Card title="Base de connaissances">
        <p className="text-sm text-tenderos-slate">
          {knowledge.total} entrée(s) spécifique(s) à ce client.{" "}
          <Link href={`/app/knowledge?clientAccountId=${client.id}`} className="text-tenderos-blue hover:underline">
            Voir →
          </Link>
        </p>
      </Card>
    </div>
  );
}
