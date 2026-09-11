import type { Metadata } from "next";
import { Badge, Card, PageHeader } from "../../../../../components/ui";
import { appApiFetch } from "../../../../../lib/app-api-client";
import { SUBCONTRACTOR_PROFILE_STATUS_LABELS, SUBCONTRACTOR_PROFILE_STATUS_TONE, type SubcontractorCertification, type SubcontractorInsurance, type SubcontractorProfile, type SubcontractorProfileDocument, type SubcontractorReference } from "../../../../../lib/subcontractor-types";
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
      <PageHeader
        breadcrumb={[{ label: "Sous-traitants", href: "/app/subcontractor-profiles" }, { label: profile.legalName }]}
        title={profile.legalName}
        status={<Badge tone={SUBCONTRACTOR_PROFILE_STATUS_TONE[profile.status] ?? "neutral"}>{SUBCONTRACTOR_PROFILE_STATUS_LABELS[profile.status]}</Badge>}
        actions={<SubcontractorLifecycleActions subcontractorId={profile.id} status={profile.status} />}
      />

      <Card title="Informations générales">
        <EditSubcontractorProfileForm profile={profile} disabled={profile.status === "ARCHIVED"} />
      </Card>

      <SubcontractorReferencesSection subcontractorId={profile.id} references={references} />

      <SubcontractorCertificationsSection subcontractorId={profile.id} certifications={certifications} />

      <SubcontractorInsurancesSection subcontractorId={profile.id} insurances={insurances} />

      <SubcontractorDocumentsSection subcontractorId={profile.id} documents={documents} />
    </div>
  );
}
