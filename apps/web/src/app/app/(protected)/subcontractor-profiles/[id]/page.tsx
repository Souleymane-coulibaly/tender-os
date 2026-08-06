import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch } from "../../../../../lib/app-api-client";
import { SUBCONTRACTOR_PROFILE_STATUS_LABELS, subcontractorProfileStatusBadgeClass, type SubcontractorCertification, type SubcontractorInsurance, type SubcontractorProfile, type SubcontractorProfileDocument, type SubcontractorReference } from "../../../../../lib/subcontractor-types";
import { ApiErrorState } from "../../api-error-state";
import { EditSubcontractorProfileForm } from "./edit-subcontractor-profile-form";
import { SubcontractorLifecycleActions } from "./subcontractor-lifecycle-actions";
import { SubcontractorCertificationsSection } from "./subcontractor-certifications-section";
import { SubcontractorDocumentsSection } from "./subcontractor-documents-section";
import { SubcontractorInsurancesSection } from "./subcontractor-insurances-section";
import { SubcontractorReferencesSection } from "./subcontractor-references-section";

export const metadata: Metadata = { title: "Sous-traitant — TenderOS" };

export default async function SubcontractorProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let profile: SubcontractorProfile;
  let references: SubcontractorReference[];
  let certifications: SubcontractorCertification[];
  let insurances: SubcontractorInsurance[];
  let documents: SubcontractorProfileDocument[];
  try {
    [profile, references, certifications, insurances, documents] = await Promise.all([
      appApiFetch<SubcontractorProfile>(`/api/v1/subcontractor-profiles/${id}`),
      appApiFetch<SubcontractorReference[]>(`/api/v1/subcontractor-profiles/${id}/references`),
      appApiFetch<SubcontractorCertification[]>(`/api/v1/subcontractor-profiles/${id}/certifications`),
      appApiFetch<SubcontractorInsurance[]>(`/api/v1/subcontractor-profiles/${id}/insurances`),
      appApiFetch<SubcontractorProfileDocument[]>(`/api/v1/subcontractor-profiles/${id}/documents`),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/app/subcontractor-profiles" className="text-sm text-neutral-500 hover:underline">
            ← Sous-traitants
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{profile.legalName}</h1>
          <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${subcontractorProfileStatusBadgeClass(profile.status)}`}>
            {SUBCONTRACTOR_PROFILE_STATUS_LABELS[profile.status]}
          </span>
        </div>
        <SubcontractorLifecycleActions subcontractorId={profile.id} status={profile.status} />
      </div>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Informations générales</h2>
        <EditSubcontractorProfileForm profile={profile} disabled={profile.status === "ARCHIVED"} />
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <SubcontractorReferencesSection subcontractorId={profile.id} references={references} />
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <SubcontractorCertificationsSection subcontractorId={profile.id} certifications={certifications} />
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <SubcontractorInsurancesSection subcontractorId={profile.id} insurances={insurances} />
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <SubcontractorDocumentsSection subcontractorId={profile.id} documents={documents} />
      </section>
    </div>
  );
}
