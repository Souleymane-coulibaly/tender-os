import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch } from "../../../../../../lib/app-api-client";
import type { CompanyProfileSummary } from "../../../../../../lib/company-profile-types";
import type { ClientAccountSummary } from "../../../../../../lib/client-portfolio-types";
import { ApiErrorState } from "../../../api-error-state";
import { CompanyProfileTabs } from "./company-profile-tabs";

export const metadata: Metadata = { title: "Profil entreprise du client — TenderOS" };

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
        <h1 className="mt-1 text-xl font-semibold">Profil entreprise du client</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Identité légale, contacts, comptes bancaires, assurances, certifications, références et moyens de ce client — distinct de la fiche{" "}
          <Link href="/app/candidate-companies" className="underline hover:text-neutral-900">
            Entreprise candidate
          </Link>
          , qui porte l&apos;entité juridique répondant effectivement à vos appels d&apos;offres.
        </p>
      </div>

      <CompanyProfileTabs clientId={id} profile={profile} />
    </div>
  );
}
