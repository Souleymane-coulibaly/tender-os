import type { Metadata } from "next";
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{organization.name}</h1>
          <p className="text-sm text-neutral-500">{organization.slug}</p>
        </div>
        <SuspendReactivateButton organizationId={organization.id} status={organization.status} />
      </div>

      <dl className="grid grid-cols-1 gap-4 rounded border border-neutral-200 p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Identifiant</dt>
          <dd className="text-sm">{organization.id}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Statut</dt>
          <dd className="text-sm">
            {ORGANIZATION_STATUS_LABELS[organization.status] ?? organization.status}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Membres actifs</dt>
          <dd className="text-sm">{organization.activeMemberCount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Créée le</dt>
          <dd className="text-sm">{new Date(organization.createdAt).toLocaleString("fr-FR")}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Mise à jour le</dt>
          <dd className="text-sm">{new Date(organization.updatedAt).toLocaleString("fr-FR")}</dd>
        </div>
      </dl>

      <OrganizationBillingSection organizationId={organization.id} />
    </div>
  );
}
