import type { Metadata } from "next";
import { Badge, PageHeader } from "../../../../../components/ui";
import { getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import { candidateCompanyDisplayName, CANDIDATE_COMPANY_STATUS_LABELS, type CandidateCompanySummary, type CandidateEstablishmentSummary } from "../../../../../lib/candidate-company-types";
import { resolveCandidateUiCapabilities } from "../../../../../lib/candidate-permissions";
import { fetchCandidateCompany, fetchCandidateEstablishments } from "../../../candidate-company-actions";
import {
  fetchCandidateBankAccounts,
  fetchCandidateCertifications,
  fetchCandidateDocuments,
  fetchCandidateHumanResources,
  fetchCandidateInsurances,
  fetchCandidateMaterialResources,
  fetchCandidateReferences,
  fetchCandidateRepresentatives,
} from "../../../candidate-capability-actions";
import { fetchDocumentsForPicker } from "../../../connectors-actions";
import { ApiErrorState } from "../../api-error-state";
import { CandidateCompanyTabs } from "./candidate-company-tabs";

export const metadata: Metadata = { title: "Entreprise candidate — TenderOS" };

/**
 * Checkpoint TENDEROS-2.1-CCV2-F — fiche UNIQUE de l'entreprise candidate (ferme DEFERRED-BE-05).
 *
 * Cette page remplace la fiche minimale qui affichait « Capacités : non disponible pour les
 * entreprises candidates aujourd'hui » : les capacités, les documents et les coordonnées bancaires
 * existent désormais réellement côté CandidateCompany (CCV2-C, C.1, D) et sont administrables ici.
 *
 * AUCUNE DÉPENDANCE LEGACY : toutes les lectures passent par `/candidate-companies/:id/*`. Aucun
 * composant `clients/[id]/company-profile/*` n'est importé, aucune lecture de `CompanyProfile` ne
 * vient compléter silencieusement l'affichage.
 *
 * Le rôle est résolu CÔTÉ SERVEUR et les capacités d'interface en découlent : la section bancaire
 * n'est pas rendue puis masquée, elle n'est jamais envoyée au navigateur pour un rôle sans droit.
 * Ce n'est pas la sécurité — l'API refuse de toute façon — c'est ce qui évite qu'une donnée
 * sensible transite ou clignote.
 */
export default async function CandidateCompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let company: CandidateCompanySummary;
  let establishments: CandidateEstablishmentSummary[];
  let role: string | undefined;
  try {
    [company, establishments, role] = await Promise.all([
      fetchCandidateCompany(id),
      fetchCandidateEstablishments(id).then((page) => page.items),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const capabilities = resolveCandidateUiCapabilities(role);

  // Les capacités bancaires ne sont même pas DEMANDÉES si le rôle n'y a pas droit : rien ne
  // transite, plutôt qu'un 403 silencieusement absorbé.
  const [representatives, certifications, insurances, references, humanResources, materialResources, documents, bankAccounts, libraryDocuments] = await Promise.all([
    fetchCandidateRepresentatives(id),
    fetchCandidateCertifications(id),
    fetchCandidateInsurances(id),
    fetchCandidateReferences(id),
    fetchCandidateHumanResources(id),
    fetchCandidateMaterialResources(id),
    fetchCandidateDocuments(id),
    capabilities.canReadBanking ? fetchCandidateBankAccounts(id) : Promise.resolve([]),
    // Gap F2 : la bibliotheque n'est chargee que si l'utilisateur peut reellement rattacher.
    capabilities.canUploadDocuments ? fetchDocumentsForPicker() : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Entreprises candidates", href: "/app/candidate-companies" }, { label: candidateCompanyDisplayName(company) }]}
        title={candidateCompanyDisplayName(company)}
        status={<Badge tone={company.status === "ACTIVE" ? "success" : "neutral"}>{CANDIDATE_COMPANY_STATUS_LABELS[company.status]}</Badge>}
      />

      <CandidateCompanyTabs
        dossier={{ company, establishments, representatives, certifications, insurances, references, humanResources, materialResources, documents, bankAccounts, libraryDocuments }}
        capabilities={capabilities}
      />
    </div>
  );
}
