"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type {
  AdministrativeDocumentSummary,
  AdministrativeRequirementSummary,
  ConsortiumMember,
  ConsortiumSummary,
  Dc1DeclarationSummary,
  Dc2DeclarationVersionSummary,
  Dc2DeclarationWithVersions,
  DumeDeclarationVersionSummary,
  DumeDeclarationWithVersions,
  EngagementActSummary,
  OfficialFormPreparationResult,
  SigningPowerSummary,
  StructuredCapacityStatement,
  SubcontractorDeclarationSummary,
} from "../../lib/administrative-dossier-types";
import { apiErrorMessage } from "../../lib/api-error-messages";

export type FormActionState = { error?: string };

function describeAdministrativeDossierActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Administrative dossier action failed (${error.status} ${error.code}): ${error.message}`);
    const known = apiErrorMessage(error);
    if (known) return known;
    switch (error.status) {
      case 400:
        return "Certains champs sont invalides.";
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
      case 404:
        return "Ressource introuvable.";
      case 409:
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 422:
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during an administrative dossier action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

/** Applique systématiquement le double `revalidatePath` (vue d'ensemble + checklist) dès la
 *  première version — correctif appris sur `deliverable-actions.ts` (commit `520cabf`, mission :
 *  toute page affichant un état dérivé du même dossier doit être invalidée, pas seulement sa page
 *  "propre"). */
function revalidateAdministrativeDossier(tenderId: string): void {
  revalidatePath(`/app/tenders/${tenderId}/administrative-dossier`);
  revalidatePath(`/app/tenders/${tenderId}/administrative-dossier/checklist`);
  revalidatePath(`/app/tenders/${tenderId}/administrative-dossier/structured`);
}

export async function createAdministrativeRequirementAction(
  tenderId: string,
  input: { title: string; requirementType: string; expectedDocumentType: string; required: boolean; description?: string },
): Promise<{ error?: string; requirement?: AdministrativeRequirementSummary }> {
  try {
    const requirement = await appApiFetch<AdministrativeRequirementSummary>(`/api/v1/tenders/${tenderId}/administrative-requirements`, { method: "POST", body: JSON.stringify(input) });
    revalidateAdministrativeDossier(tenderId);
    return { requirement };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

async function updateAdministrativeRequirementAction(tenderId: string, requirementId: string, body: Record<string, unknown>): Promise<FormActionState> {
  try {
    await appApiFetch(`/api/v1/administrative-requirements/${requirementId}`, { method: "PATCH", body: JSON.stringify(body) });
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
  revalidateAdministrativeDossier(tenderId);
  return {};
}

export async function confirmAdministrativeRequirementAction(tenderId: string, requirementId: string): Promise<FormActionState> {
  return updateAdministrativeRequirementAction(tenderId, requirementId, { action: "CONFIRM" });
}

export async function rejectAdministrativeRequirementAction(tenderId: string, requirementId: string): Promise<FormActionState> {
  return updateAdministrativeRequirementAction(tenderId, requirementId, { action: "REJECT" });
}

export async function markAdministrativeRequirementNotApplicableAction(tenderId: string, requirementId: string): Promise<FormActionState> {
  return updateAdministrativeRequirementAction(tenderId, requirementId, { action: "NOT_APPLICABLE" });
}

export async function createAdministrativeDocumentAction(
  tenderId: string,
  input: { documentType: string; label: string; requirementId?: string },
): Promise<{ error?: string; document?: AdministrativeDocumentSummary }> {
  try {
    const document = await appApiFetch<AdministrativeDocumentSummary>(`/api/v1/tenders/${tenderId}/administrative-documents`, { method: "POST", body: JSON.stringify(input) });
    revalidateAdministrativeDossier(tenderId);
    return { document };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function getAdministrativeDocumentAction(administrativeDocumentId: string): Promise<{ error?: string; document?: AdministrativeDocumentSummary }> {
  try {
    const document = await appApiFetch<AdministrativeDocumentSummary>(`/api/v1/administrative-documents/${administrativeDocumentId}`);
    return { document };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function attachAdministrativeDocumentRevisionAction(
  tenderId: string,
  administrativeDocumentId: string,
  input: { documentId: string; expiresAt?: string },
): Promise<{ error?: string; document?: AdministrativeDocumentSummary }> {
  try {
    const document = await appApiFetch<AdministrativeDocumentSummary>(`/api/v1/administrative-documents/${administrativeDocumentId}/revisions`, { method: "POST", body: JSON.stringify(input) });
    revalidateAdministrativeDossier(tenderId);
    return { document };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function validateAdministrativeDocumentAction(tenderId: string, administrativeDocumentId: string, revisionId: string): Promise<FormActionState> {
  try {
    await appApiFetch(`/api/v1/administrative-documents/${administrativeDocumentId}/validate`, { method: "POST", body: JSON.stringify({ revisionId }) });
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
  revalidateAdministrativeDossier(tenderId);
  return {};
}

export async function rejectAdministrativeDocumentAction(tenderId: string, administrativeDocumentId: string, revisionId: string): Promise<FormActionState> {
  try {
    await appApiFetch(`/api/v1/administrative-documents/${administrativeDocumentId}/reject`, { method: "POST", body: JSON.stringify({ revisionId }) });
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
  revalidateAdministrativeDossier(tenderId);
  return {};
}

// --- Sprint 8C Phase 2 ---

export async function ensureConsortiumAction(tenderId: string, type: string): Promise<{ error?: string; consortium?: ConsortiumSummary }> {
  try {
    const consortium = await appApiFetch<ConsortiumSummary>(`/api/v1/tenders/${tenderId}/administrative-consortium`, { method: "POST", body: JSON.stringify({ type }) });
    revalidateAdministrativeDossier(tenderId);
    return { consortium };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function updateConsortiumAction(
  tenderId: string,
  consortiumId: string,
  input: { type?: string; legalForm?: string; members?: ConsortiumMember[]; mandataireMemberId?: string },
): Promise<{ error?: string; consortium?: ConsortiumSummary }> {
  try {
    const consortium = await appApiFetch<ConsortiumSummary>(`/api/v1/administrative-consortiums/${consortiumId}`, { method: "PATCH", body: JSON.stringify(input) });
    revalidateAdministrativeDossier(tenderId);
    return { consortium };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function ensureDc1DeclarationAction(tenderId: string): Promise<{ error?: string; dc1?: Dc1DeclarationSummary }> {
  try {
    const dc1 = await appApiFetch<Dc1DeclarationSummary>(`/api/v1/tenders/${tenderId}/administrative-dc1`, { method: "POST" });
    revalidateAdministrativeDossier(tenderId);
    return { dc1 };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function updateDc1DeclarationAction(
  tenderId: string,
  dc1DeclarationId: string,
  input: { candidateType?: string; consortiumId?: string; signatoryName?: string; signatoryCapacity?: string },
): Promise<{ error?: string; dc1?: Dc1DeclarationSummary }> {
  try {
    const dc1 = await appApiFetch<Dc1DeclarationSummary>(`/api/v1/administrative-dc1-declarations/${dc1DeclarationId}`, { method: "PATCH", body: JSON.stringify(input) });
    revalidateAdministrativeDossier(tenderId);
    return { dc1 };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function ensureDc2DeclarationAction(tenderId: string): Promise<{ error?: string; dc2?: Dc2DeclarationWithVersions }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/administrative-dc2`, { method: "POST" });
    const dc2 = await appApiFetch<Dc2DeclarationWithVersions>(`/api/v1/tenders/${tenderId}/administrative-dc2`);
    revalidateAdministrativeDossier(tenderId);
    return { dc2 };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function createDc2DeclarationVersionAction(tenderId: string, dc2DeclarationId: string, data: StructuredCapacityStatement): Promise<{ error?: string; version?: Dc2DeclarationVersionSummary }> {
  try {
    const version = await appApiFetch<Dc2DeclarationVersionSummary>(`/api/v1/administrative-dc2-declarations/${dc2DeclarationId}/versions`, { method: "POST", body: JSON.stringify({ data }) });
    revalidateAdministrativeDossier(tenderId);
    return { version };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function ensureDumeDeclarationAction(tenderId: string): Promise<{ error?: string; dume?: DumeDeclarationWithVersions }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/administrative-dume`, { method: "POST" });
    const dume = await appApiFetch<DumeDeclarationWithVersions>(`/api/v1/tenders/${tenderId}/administrative-dume`);
    revalidateAdministrativeDossier(tenderId);
    return { dume };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function createDumeDeclarationVersionAction(tenderId: string, dumeDeclarationId: string, data: StructuredCapacityStatement): Promise<{ error?: string; version?: DumeDeclarationVersionSummary }> {
  try {
    const version = await appApiFetch<DumeDeclarationVersionSummary>(`/api/v1/administrative-dume-declarations/${dumeDeclarationId}/versions`, { method: "POST", body: JSON.stringify({ data }) });
    revalidateAdministrativeDossier(tenderId);
    return { version };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function createSubcontractorDeclarationAction(
  tenderId: string,
  input: { subcontractorName: string; servicesDescription: string; amountValue: number; amountCurrency: string; percentageOfTotal?: number },
): Promise<{ error?: string; declaration?: SubcontractorDeclarationSummary }> {
  try {
    const declaration = await appApiFetch<SubcontractorDeclarationSummary>(`/api/v1/tenders/${tenderId}/administrative-subcontractors`, { method: "POST", body: JSON.stringify(input) });
    revalidateAdministrativeDossier(tenderId);
    return { declaration };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function ensureEngagementActAction(tenderId: string): Promise<{ error?: string; act?: EngagementActSummary }> {
  try {
    const act = await appApiFetch<EngagementActSummary>(`/api/v1/tenders/${tenderId}/administrative-engagement-act`, { method: "POST" });
    revalidateAdministrativeDossier(tenderId);
    return { act };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function freezeEngagementActPricingAction(
  tenderId: string,
  engagementActId: string,
  input: { pricingEstimateId: string; pricingEstimateVersionNumber: number },
): Promise<{ error?: string; act?: EngagementActSummary }> {
  try {
    const act = await appApiFetch<EngagementActSummary>(`/api/v1/administrative-engagement-acts/${engagementActId}/freeze-pricing`, { method: "POST", body: JSON.stringify(input) });
    revalidateAdministrativeDossier(tenderId);
    return { act };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function unfreezeEngagementActPricingAction(tenderId: string, engagementActId: string): Promise<{ error?: string; act?: EngagementActSummary }> {
  try {
    const act = await appApiFetch<EngagementActSummary>(`/api/v1/administrative-engagement-acts/${engagementActId}/unfreeze-pricing`, { method: "POST" });
    revalidateAdministrativeDossier(tenderId);
    return { act };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function createSigningPowerAction(
  tenderId: string,
  input: { holderName: string; representedEntityDescription: string; scope: string },
): Promise<{ error?: string; power?: SigningPowerSummary }> {
  try {
    const power = await appApiFetch<SigningPowerSummary>(`/api/v1/tenders/${tenderId}/administrative-signing-powers`, { method: "POST", body: JSON.stringify(input) });
    revalidateAdministrativeDossier(tenderId);
    return { power };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function linkSigningPowerProofAction(tenderId: string, signingPowerId: string, administrativeDocumentId: string): Promise<{ error?: string; power?: SigningPowerSummary }> {
  try {
    const power = await appApiFetch<SigningPowerSummary>(`/api/v1/administrative-signing-powers/${signingPowerId}`, { method: "PATCH", body: JSON.stringify({ administrativeDocumentId }) });
    revalidateAdministrativeDossier(tenderId);
    return { power };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function verifySigningPowerAction(tenderId: string, signingPowerId: string): Promise<{ error?: string; power?: SigningPowerSummary }> {
  try {
    const power = await appApiFetch<SigningPowerSummary>(`/api/v1/administrative-signing-powers/${signingPowerId}/verify`, { method: "POST" });
    revalidateAdministrativeDossier(tenderId);
    return { power };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function setAdministrativeDocumentSignatureModeAction(tenderId: string, administrativeDocumentId: string, mode: string): Promise<{ error?: string; document?: AdministrativeDocumentSummary }> {
  try {
    const document = await appApiFetch<AdministrativeDocumentSummary>(`/api/v1/administrative-documents/${administrativeDocumentId}/signature-mode`, { method: "POST", body: JSON.stringify({ mode }) });
    revalidateAdministrativeDossier(tenderId);
    return { document };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function recordAdministrativeDocumentSignatureAction(tenderId: string, administrativeDocumentId: string): Promise<{ error?: string; document?: AdministrativeDocumentSummary }> {
  try {
    const document = await appApiFetch<AdministrativeDocumentSummary>(`/api/v1/administrative-documents/${administrativeDocumentId}/signature/record`, { method: "POST" });
    revalidateAdministrativeDossier(tenderId);
    return { document };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

// --- Sprint 8C Phase 3 (génération PDF/XML) ---

export async function generateDc1DocumentAction(tenderId: string): Promise<{ error?: string; document?: AdministrativeDocumentSummary }> {
  try {
    const document = await appApiFetch<AdministrativeDocumentSummary>(`/api/v1/tenders/${tenderId}/administrative-dc1/generate-pdf`, { method: "POST" });
    revalidateAdministrativeDossier(tenderId);
    return { document };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function generateDc2DocumentAction(tenderId: string): Promise<{ error?: string; document?: AdministrativeDocumentSummary }> {
  try {
    const document = await appApiFetch<AdministrativeDocumentSummary>(`/api/v1/tenders/${tenderId}/administrative-dc2/generate-pdf`, { method: "POST" });
    revalidateAdministrativeDossier(tenderId);
    return { document };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function generateDumeDocumentAction(tenderId: string): Promise<{ error?: string; document?: AdministrativeDocumentSummary }> {
  try {
    const document = await appApiFetch<AdministrativeDocumentSummary>(`/api/v1/tenders/${tenderId}/administrative-dume/generate-pdf`, { method: "POST" });
    revalidateAdministrativeDossier(tenderId);
    return { document };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function generateSubcontractorDeclarationDocumentAction(tenderId: string, subcontractorDeclarationId: string): Promise<{ error?: string; document?: AdministrativeDocumentSummary }> {
  try {
    const document = await appApiFetch<AdministrativeDocumentSummary>(`/api/v1/administrative-subcontractors/${subcontractorDeclarationId}/generate-pdf`, { method: "POST" });
    revalidateAdministrativeDossier(tenderId);
    return { document };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function generateEngagementActDocumentAction(tenderId: string): Promise<{ error?: string; document?: AdministrativeDocumentSummary }> {
  try {
    const document = await appApiFetch<AdministrativeDocumentSummary>(`/api/v1/tenders/${tenderId}/administrative-engagement-act/generate-pdf`, { method: "POST" });
    revalidateAdministrativeDossier(tenderId);
    return { document };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

// --- Sprint 8C.1 (formulaires officiels — DC4) ---

export async function prepareDc4OfficialFormAction(subcontractorDeclarationId: string): Promise<{ error?: string; result?: OfficialFormPreparationResult }> {
  try {
    const result = await appApiFetch<OfficialFormPreparationResult>(`/api/v1/administrative-subcontractors/${subcontractorDeclarationId}/official-form`);
    return { result };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function saveDc4OfficialFormDraftAction(
  tenderId: string,
  subcontractorDeclarationId: string,
  data: Record<string, string>,
): Promise<{ error?: string; result?: OfficialFormPreparationResult }> {
  try {
    const result = await appApiFetch<OfficialFormPreparationResult>(`/api/v1/administrative-subcontractors/${subcontractorDeclarationId}/official-form/draft`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    revalidateAdministrativeDossier(tenderId);
    return { result };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}

export async function generateDc4OfficialFormAction(tenderId: string, subcontractorDeclarationId: string): Promise<{ error?: string; document?: AdministrativeDocumentSummary }> {
  try {
    const document = await appApiFetch<AdministrativeDocumentSummary>(`/api/v1/administrative-subcontractors/${subcontractorDeclarationId}/official-form/generate`, { method: "POST" });
    revalidateAdministrativeDossier(tenderId);
    return { document };
  } catch (error) {
    return { error: describeAdministrativeDossierActionError(error) };
  }
}
