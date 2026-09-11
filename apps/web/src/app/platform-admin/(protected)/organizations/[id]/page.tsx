import type { Metadata } from "next";
import { Card, PageHeader } from "../../../../../components/ui";
import { platformApiFetch } from "../../../../../lib/platform-api-client";
import {
  ORGANIZATION_STATUS_LABELS,
  type PlatformOrganization,
} from "../../../../../lib/platform-admin-types";
import { ApiErrorState } from "../../api-error-state";
import { SuspendReactivateButton } from "./suspend-reactivate-button";
import { OrganizationBillingSection } from "./organization-billing-section";

export const metadata: Metadata = { title: "Organisation — Platform Admin — TenderOS" };

export default async function PlatformAdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let organization: PlatformOrganization;

  try {
    organization = await platformApiFetch<PlatformOrganization>(
      `/api/v1/admin/organizations/${id}`,
    );
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Organisations", href: "/platform-admin/organizations" }, { label: organization.name }]}
        title={organization.name}
        description={organization.slug}
        actions={<SuspendReactivateButton organizationId={organization.id} status={organization.status} />}
      />

      <Card>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-tenderos-slate">Identifiant</dt>
            <dd className="break-all text-sm text-tenderos-navy">{organization.id}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-tenderos-slate">Statut</dt>
            <dd className="text-sm text-tenderos-navy">
              {ORGANIZATION_STATUS_LABELS[organization.status] ?? organization.status}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-tenderos-slate">Membres actifs</dt>
            <dd className="text-sm text-tenderos-navy">{organization.activeMemberCount}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-tenderos-slate">Créée le</dt>
            <dd className="text-sm text-tenderos-navy">{new Date(organization.createdAt).toLocaleString("fr-FR")}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-tenderos-slate">Mise à jour le</dt>
            <dd className="text-sm text-tenderos-navy">{new Date(organization.updatedAt).toLocaleString("fr-FR")}</dd>
          </div>
        </dl>
      </Card>

      <OrganizationBillingSection organizationId={organization.id} />
    </div>
  );
}
