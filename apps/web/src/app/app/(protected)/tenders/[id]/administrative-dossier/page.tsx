import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import { ensureAdministrativeDossierAction } from "../../../../administrative-dossier-actions";
import type { AdministrativeDossierCapabilities, AdministrativeDossierSummary } from "../../../../../../lib/administrative-dossier-types";
import { ADMINISTRATIVE_DOSSIER_STATUS_LABELS, administrativeDossierStatusBadgeClass } from "../../../../../../lib/administrative-dossier-types";
import { canUseDocumentGeneration, type DocumentTemplateSummary, type GeneratedDocumentSummary } from "../../../../../../lib/document-generation-types";
import { fetchDocumentTemplates, fetchGeneratedDocuments } from "../../../../document-generation-actions";
import { fetchConsortium, fetchDc1Readiness, fetchDc2CandidateReadiness, fetchDc2MemberReadiness, fetchDc4Readiness, fetchSubcontractorDeclarations } from "../../../../official-form-actions";
import type { OfficialFormReadiness } from "../../../../../../lib/official-form-types";
import { ApiErrorState } from "../../../api-error-state";
import { OfficialFormsSection, type FormCardSpec } from "./official-forms-section";

export const metadata: Metadata = { title: "Dossier administratif — TenderOS" };

function downloadHrefFor(tenderId: string) {
  return (revisionId: string) => `/app/tenders/${tenderId}/documents-generated/document-revisions/${revisionId}/download`;
}

function findGeneratedDocument(generatedDocuments: GeneratedDocumentSummary[], templates: DocumentTemplateSummary[], templateName: string, subjectId: string | null): GeneratedDocumentSummary | undefined {
  const templateIds = new Set(templates.filter((t) => t.name === templateName).map((t) => t.id));
  return generatedDocuments.find((doc) => templateIds.has(doc.documentTemplateId) && (doc.subjectId ?? null) === subjectId);
}

/** Sprint 8C Phase 1 — un dossier existe toujours dès qu'un Tender existe. Sprint 11B — étend cette
 *  page (jamais une seconde vue "Dossier administratif" parallèle, mission §25) avec le
 *  préremplissage des VRAIS formulaires officiels (DC1/DC2/DC4) : readiness, aperçu, génération
 *  facultative, historique — mission §27 "vue non bloquante", §35 "génération ≠ validation". */
export default async function AdministrativeDossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  try {
    await ensureAdministrativeDossierAction(tenderId);
    const [dossier, capabilities, actorRole, dc1Readiness, dc2CandidateReadiness, consortium, subcontractorDeclarations, generatedDocuments, templates] = await Promise.all([
      appApiFetch<AdministrativeDossierSummary>(`/api/v1/tenders/${tenderId}/administrative-dossier`),
      appApiFetch<AdministrativeDossierCapabilities>(`/api/v1/tenders/${tenderId}/administrative-dossier/capabilities`),
      getCurrentMembershipRole(),
      fetchDc1Readiness(tenderId).catch(() => null),
      fetchDc2CandidateReadiness(tenderId).catch(() => null),
      fetchConsortium(tenderId).catch(() => null),
      fetchSubcontractorDeclarations(tenderId).catch(() => []),
      fetchGeneratedDocuments(tenderId).catch(() => []),
      fetchDocumentTemplates().catch(() => []),
    ]);

    const memberReadinessEntries = consortium
      ? await Promise.all(
          consortium.members.map(async (member) => {
            const readiness = await fetchDc2MemberReadiness(tenderId, member.memberId).catch(() => null);
            return { member, readiness };
          }),
        )
      : [];

    const dc4ReadinessEntries = await Promise.all(
      subcontractorDeclarations.map(async (declaration) => {
        const readiness = await fetchDc4Readiness(declaration.id).catch(() => null);
        return { declaration, readiness };
      }),
    );

    const canGenerate = canUseDocumentGeneration(actorRole);
    const download = downloadHrefFor(tenderId);
    const cards: FormCardSpec[] = [];

    if (dc1Readiness) {
      cards.push({
        key: "dc1",
        title: "DC1 — Lettre de candidature",
        operatorLabel: "Candidat",
        initialReadiness: dc1Readiness,
        initialGeneratedDocument: findGeneratedDocument(generatedDocuments, templates, "DC1", null),
        canGenerate,
        action: "dc1",
        tenderId,
        downloadHref: download,
      });
    }
    if (dc2CandidateReadiness) {
      cards.push({
        key: "dc2-candidate",
        title: "DC2 — Déclaration du candidat",
        operatorLabel: "Candidat",
        initialReadiness: dc2CandidateReadiness,
        initialGeneratedDocument: findGeneratedDocument(generatedDocuments, templates, "DC2", "candidate"),
        canGenerate,
        action: "dc2-candidate",
        tenderId,
        downloadHref: download,
      });
    }
    for (const { member, readiness } of memberReadinessEntries) {
      if (!readiness) continue;
      cards.push({
        key: `dc2-member-${member.memberId}`,
        title: "DC2 — Déclaration du candidat (groupement)",
        operatorLabel: member.name,
        initialReadiness: readiness as OfficialFormReadiness,
        initialGeneratedDocument: findGeneratedDocument(generatedDocuments, templates, "DC2", `member:${member.memberId}`),
        canGenerate,
        action: "dc2-member",
        tenderId,
        memberId: member.memberId,
        downloadHref: download,
      });
    }
    for (const { declaration, readiness } of dc4ReadinessEntries) {
      if (!readiness) continue;
      cards.push({
        key: `dc4-${declaration.id}`,
        title: "DC4 — Déclaration de sous-traitance",
        operatorLabel: declaration.subcontractorName,
        initialReadiness: readiness as OfficialFormReadiness,
        initialGeneratedDocument: findGeneratedDocument(generatedDocuments, templates, "DC4", declaration.id),
        canGenerate,
        action: "dc4",
        tenderId,
        subcontractorDeclarationId: declaration.id,
        downloadHref: download,
      });
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Dossier administratif</h1>
            <p className="text-sm text-neutral-600">
              TenderOS assiste la constitution du dossier sans garantir juridiquement sa conformité — la vérification finale reste
              humaine.
            </p>
          </div>
          <span className={`w-fit rounded px-2 py-1 text-xs font-medium ${administrativeDossierStatusBadgeClass(dossier.status)}`}>
            {ADMINISTRATIVE_DOSSIER_STATUS_LABELS[dossier.status] ?? dossier.status}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded border border-neutral-200 p-3">
            <span className="text-xs font-medium text-neutral-500">Complétude</span>
            <p className="text-lg font-semibold text-neutral-900">{dossier.completionPercentage}%</p>
          </div>
          <div className="rounded border border-neutral-200 p-3">
            <span className="text-xs font-medium text-neutral-500">Validation humaine</span>
            <p className="text-lg font-semibold text-neutral-900">
              {dossier.validationStatus === "VALIDATED" ? "Validé" : dossier.validationStatus === "OUTDATED" ? "Périmée" : "Non validé"}
            </p>
          </div>
          <div className="rounded border border-neutral-200 p-3">
            <span className="text-xs font-medium text-neutral-500">Signature</span>
            <p className="text-sm text-neutral-600">Non gérée à ce stade (phase ultérieure)</p>
          </div>
        </div>

        {capabilities.blockers.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {capabilities.blockers.map((blocker, index) => (
              <li key={index} role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800">
                {blocker}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Link href={`/app/tenders/${tenderId}/administrative-dossier/checklist`} className="w-fit rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white">
            Ouvrir la checklist →
          </Link>
          <Link href={`/app/tenders/${tenderId}/administrative-dossier/structured`} className="w-fit rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700">
            Groupement, DC1/DC2/DUME, sous-traitance, acte d&apos;engagement, pouvoirs →
          </Link>
        </div>

        <div>
          <h2 className="text-base font-semibold text-neutral-900">Formulaires officiels</h2>
          <p className="mb-3 text-xs text-neutral-500">
            Préremplissage automatique depuis les données du dossier. Consultez la disponibilité des champs et générez le DOCX
            officiel quand vous le souhaitez — jamais requis pour continuer à utiliser TenderOS.
          </p>
          <OfficialFormsSection cards={cards} />
        </div>
      </div>
    );
  } catch (error) {
    return <ApiErrorState error={error} />;
  }
}
