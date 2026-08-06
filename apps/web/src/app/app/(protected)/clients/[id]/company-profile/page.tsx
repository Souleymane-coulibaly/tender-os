import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch } from "../../../../../../lib/app-api-client";
import type { CompanyProfileSummary } from "../../../../../../lib/company-profile-types";
import type { ClientAccountSummary } from "../../../../../../lib/client-portfolio-types";
import { ApiErrorState } from "../../../api-error-state";
import { CompanyProfileTabs } from "./company-profile-tabs";

export const metadata: Metadata = { title: "Entreprise candidate — TenderOS" };

export default async function CompanyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let client: ClientAccountSummary;
  let profile: CompanyProfileSummary;
  try {
    [client, profile] = await Promise.all([
      appApiFetch<ClientAccountSummary>(`/api/v1/clients/${id}`),
      appApiFetch<CompanyProfileSummary>(`/api/v1/clients/${id}/profile`),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/app/clients/${id}`} className="text-sm text-neutral-500 hover:underline">
          ← {client.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Entreprise candidate</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Identité légale, contacts, comptes bancaires, assurances, certifications, références et moyens — la source unique pour préparer vos réponses.
        </p>
      </div>

      <CompanyProfileTabs clientId={id} profile={profile} />
    </div>
  );
}
