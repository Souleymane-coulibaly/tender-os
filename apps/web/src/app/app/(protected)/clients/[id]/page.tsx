import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import {
  CLIENT_ACCOUNT_STATUS_LABELS,
  clientAccountStatusBadgeClass,
  type ClientAccountSummary,
  type ClientAssignmentView,
} from "../../../../../lib/client-portfolio-types";
import type { PageResponse, TenderListItem } from "../../../../../lib/tenders-types";
import type { KnowledgePage, KnowledgeEntrySummary } from "../../../../../lib/knowledge-types";
import type { ClientCostSummary } from "../../../../../lib/pricing-types";
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
 *  revalide toujours l'action réellement soumise, quelle que soit l'UI affichée ici. */
function canManageAssignments(actorRole: string | undefined): boolean {
  return actorRole === "OWNER" || actorRole === "ORGANIZATION_ADMIN";
}

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
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/app/clients" className="text-sm text-neutral-500 hover:underline">
              ← Clients
            </Link>
          </div>
          <h1 className="mt-1 text-xl font-semibold">{client.name}</h1>
          <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${clientAccountStatusBadgeClass(client.status)}`}>
            {CLIENT_ACCOUNT_STATUS_LABELS[client.status]}
          </span>
        </div>
        {canManage ? <ClientLifecycleActions client={client} canDelete={canDelete} /> : null}
      </div>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Informations générales</h2>
        <EditClientAccountForm client={client} disabled={client.status === "ARCHIVED"} />
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Profil entreprise du client</h2>
            <p className="mt-1 text-sm text-neutral-600">Identité légale, contacts, comptes bancaires, assurances, certifications, références et moyens.</p>
          </div>
          <Link href={`/app/clients/${client.id}/company-profile`} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
            Ouvrir la fiche →
          </Link>
        </div>
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <ClientAssignmentsSection clientId={client.id} assignments={assignments} candidates={candidates} canManage={canManage} />
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <ClientTendersSection clientId={client.id} tenders={tenders.items} hasMore={tenders.pageInfo.hasNextPage} />
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Pricing &amp; prévisions</h2>
        <ClientPricingSection summary={pricing} />
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Base de connaissances</h2>
        <p className="mt-2 text-sm text-neutral-600">
          {knowledge.total} entrée(s) spécifique(s) à ce client.{" "}
          <Link href={`/app/knowledge?clientAccountId=${client.id}`} className="text-neutral-700 hover:underline">
            Voir →
          </Link>
        </p>
      </section>
    </div>
  );
}
