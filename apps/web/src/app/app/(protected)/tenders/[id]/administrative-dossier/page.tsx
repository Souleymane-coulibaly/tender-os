import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import { describeApiError } from "../../../../../../lib/api-error-messages";
import type {
  AdministrativeDossierCapabilities,
  AdministrativeDossierSummary,
} from "../../../../../../lib/administrative-dossier-types";
import { ADMINISTRATIVE_DOSSIER_STATUS_LABELS } from "../../../../../../lib/administrative-dossier-types";
import {
  canUseDocumentGeneration,
  type DocumentTemplateSummary,
  type GeneratedDocumentSummary,
} from "../../../../../../lib/document-generation-types";
import {
  fetchDocumentTemplates,
  fetchGeneratedDocuments,
} from "../../../../document-generation-actions";
import {
  fetchConsortium,
  fetchDc1Readiness,
  fetchDc2CandidateReadiness,
  fetchDc2MemberReadiness,
  fetchDc4Readiness,
  fetchSubcontractorDeclarations,
} from "../../../../official-form-actions";
import type { OfficialFormReadiness } from "../../../../../../lib/official-form-types";
import { Badge, type BadgeTone } from "../../../../../../components/ui/badge";
import { Button } from "../../../../../../components/ui/button";
import { Card } from "../../../../../../components/ui/card";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { asApiError } from "../../../../../../lib/page-load-error";
import { buildTenderNavTabs } from "../tender-nav-tabs";
import { OfficialFormsSection, type FormCardSpec } from "./official-forms-section";

function dossierStatusTone(status: AdministrativeDossierSummary["status"]): BadgeTone {
  switch (status) {
    case "READY":
      return "success";
    case "BLOCKED":
      return "danger";
    case "IN_VERIFICATION":
      return "info";
    case "TO_COMPLETE":
      return "warning";
    default:
      return "neutral";
  }
}

export const metadata: Metadata = { title: "Dossier administratif — TenderOS" };

function findGeneratedDocument(
  generatedDocuments: GeneratedDocumentSummary[],
  templates: DocumentTemplateSummary[],
  templateName: string,
  subjectId: string | null,
): GeneratedDocumentSummary | undefined {
  const templateIds = new Set(templates.filter((t) => t.name === templateName).map((t) => t.id));
  return generatedDocuments.find(
    (doc) => templateIds.has(doc.documentTemplateId) && (doc.subjectId ?? null) === subjectId,
  );
}

/** Sprint 8C Phase 1 — un dossier existe toujours dès qu'un Tender existe. Sprint 11B — étend cette
 *  page (jamais une seconde vue "Dossier administratif" parallèle, mission §25) avec le
 *  préremplissage des VRAIS formulaires officiels (DC1/DC2/DC4) : readiness, aperçu, génération
 *  facultative, historique — mission §27 "vue non bloquante", §35 "génération ≠ validation". */
export default async function AdministrativeDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tenderId } = await params;

  // Crée le dossier s'il manque — appel direct, jamais une server action : celles-ci revalident des
  // chemins, ce que Next interdit pendant un rendu (erreur E7, page entière en échec). Le rendu qui
  // suit lit de toute façon l'état frais. Un refus (droit actif manquant — abonnement, essai ou
  // Pass —, permission) est gardé : sans lui la lecture ci-dessous ne dirait que « introuvable ».
  // Jamais bloquant en soi : un rôle en lecture seule, qui ne peut pas créer, doit toujours pouvoir
  // consulter un dossier qui existe déjà.
  let ensureError: string | undefined;
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/administrative-dossier`, { method: "POST" });
  } catch (error) {
    ensureError = describeApiError(error, "Le dossier administratif n'a pas pu être créé.");
  }

  try {
    const [
      dossier,
      capabilities,
      actorRole,
      dc1Readiness,
      dc2CandidateReadiness,
      consortium,
      subcontractorDeclarations,
      generatedDocuments,
      templates,
    ] = await Promise.all([
      appApiFetch<AdministrativeDossierSummary>(
        `/api/v1/tenders/${tenderId}/administrative-dossier`,
      ),
      appApiFetch<AdministrativeDossierCapabilities>(
        `/api/v1/tenders/${tenderId}/administrative-dossier/capabilities`,
      ),
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
            const readiness = await fetchDc2MemberReadiness(tenderId, member.memberId).catch(
              () => null,
            );
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
      });
    }
    if (dc2CandidateReadiness) {
      cards.push({
        key: "dc2-candidate",
        title: "DC2 — Déclaration du candidat",
        operatorLabel: "Candidat",
        initialReadiness: dc2CandidateReadiness,
        initialGeneratedDocument: findGeneratedDocument(
          generatedDocuments,
          templates,
          "DC2",
          "candidate",
        ),
        canGenerate,
        action: "dc2-candidate",
        tenderId,
      });
    }
    for (const { member, readiness } of memberReadinessEntries) {
      if (!readiness) continue;
      cards.push({
        key: `dc2-member-${member.memberId}`,
        title: "DC2 — Déclaration du candidat (groupement)",
        operatorLabel: member.name,
        initialReadiness: readiness as OfficialFormReadiness,
        initialGeneratedDocument: findGeneratedDocument(
          generatedDocuments,
          templates,
          "DC2",
          `member:${member.memberId}`,
        ),
        canGenerate,
        action: "dc2-member",
        tenderId,
        memberId: member.memberId,
      });
    }
    for (const { declaration, readiness } of dc4ReadinessEntries) {
      if (!readiness) continue;
      cards.push({
        key: `dc4-${declaration.id}`,
        title: "DC4 — Déclaration de sous-traitance",
        operatorLabel: declaration.subcontractorName,
        initialReadiness: readiness as OfficialFormReadiness,
        initialGeneratedDocument: findGeneratedDocument(
          generatedDocuments,
          templates,
          "DC4",
          declaration.id,
        ),
        canGenerate,
        action: "dc4",
        tenderId,
        subcontractorDeclarationId: declaration.id,
      });
    }

    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          breadcrumb={[
            { label: "Appels d'offres", href: "/app/tenders" },
            { label: "Dossier", href: `/app/tenders/${tenderId}` },
            { label: "Dossier administratif" },
          ]}
          title="Dossier administratif"
          description="TenderOS assiste la constitution du dossier sans garantir juridiquement sa conformité — la vérification finale reste humaine."
          guideKey="tender-administrative-dossier"
          status={
            <Badge tone={dossierStatusTone(dossier.status)}>
              {ADMINISTRATIVE_DOSSIER_STATUS_LABELS[dossier.status] ?? dossier.status}
            </Badge>
          }
        />

        <TabsNav
          items={buildTenderNavTabs(tenderId)}
          activeHref={`/app/tenders/${tenderId}/administrative-dossier`}
        />

        <div data-tour="guide-tender-administrative-dossier-summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card padding="tight">
            <span className="text-xs font-medium text-tenderos-slate">Complétude</span>
            <p className="text-lg font-extrabold tabular-nums text-tenderos-navy">
              {dossier.completionPercentage}%
            </p>
          </Card>
          <Card padding="tight">
            <span className="text-xs font-medium text-tenderos-slate">Validation humaine</span>
            <p className="text-lg font-extrabold text-tenderos-navy">
              {dossier.validationStatus === "VALIDATED"
                ? "Validé"
                : dossier.validationStatus === "OUTDATED"
                  ? "Périmée"
                  : "Non validé"}
            </p>
          </Card>
          <Card padding="tight">
            <span className="text-xs font-medium text-tenderos-slate">Signature</span>
            {/* La signature électronique a son propre écran (onglet « Signature ») : la carte y renvoie. */}
            <p className="text-sm text-tenderos-slate">
              Gérée dans l&apos;onglet{" "}
              <Link href={`/app/tenders/${tenderId}/signature`} className="font-medium text-tenderos-blue hover:underline">
                Signature
              </Link>
              .
            </p>
          </Card>
        </div>

        {capabilities.blockers.length > 0 ? (
          <ul data-tour="guide-tender-administrative-dossier-blockers" className="flex flex-col gap-1.5">
            {capabilities.blockers.map((blocker, index) => (
              <li
                key={index}
                role="alert"
                className="rounded-2xl bg-danger-bg px-3 py-1.5 text-xs text-danger-fg shadow-sm"
              >
                {blocker}
              </li>
            ))}
          </ul>
        ) : null}

        <div data-tour="guide-tender-administrative-dossier-actions" className="flex flex-wrap gap-2">
          <Button
            href={`/app/tenders/${tenderId}/administrative-dossier/checklist`}
            variant="primary"
          >
            Ouvrir la checklist →
          </Button>
          <Button
            href={`/app/tenders/${tenderId}/administrative-dossier/structured`}
            variant="secondary"
          >
            Groupement, DC1/DC2/DUME, sous-traitance, acte d&apos;engagement, pouvoirs →
          </Button>
        </div>

        {/* Guide de page : `Card` ne transmet pas `data-tour`, d'où l'enveloppe. */}
        <div data-tour="guide-tender-administrative-dossier-forms">
          <Card
            title="Formulaires officiels"
            description="Préremplissage automatique depuis les données du dossier. Consultez la disponibilité des champs et générez le DOCX officiel quand vous le souhaitez — jamais requis pour continuer à utiliser TenderOS."
          >
            <OfficialFormsSection cards={cards} />
          </Card>
        </div>
      </div>
    );
  } catch (error) {
    // Dossier absent PARCE QUE sa création a été refusée : on dit la vraie cause, pas « introuvable ».
    if (ensureError && asApiError(error)?.status === 404) {
      return (
        <div role="alert" className="rounded-2xl bg-warning-bg p-4 text-sm text-warning-fg shadow-sm">
          {ensureError}
        </div>
      );
    }
    return <ApiErrorState error={error} />;
  }
}
