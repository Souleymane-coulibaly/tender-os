"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type {
  PackageArtifact,
  PackageCompleteness,
  PackageItem,
  PackageItemApplicabilityStatus,
  PackageItemRequirementType,
  ResponsePackage,
  ResponsePackageVersion,
} from "../../lib/response-package-types";

export type ResponsePackageActionState = { error?: string };

function describeResponsePackageActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Response package action failed (${error.status} ${error.code}): ${error.message}`);
    switch (error.status) {
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action sur le dossier de réponse.";
      case 404:
        return "Introuvable ou accès refusé.";
      case 409:
        if (error.code === "DUPLICATE_RESPONSE_PACKAGE") return "Un dossier de réponse existe déjà pour ce lot.";
        if (error.code === "RESPONSE_PACKAGE_VERSION_VALIDATED") return "Cette version est déjà validée et immuable — reconstruisez une nouvelle version pour tout changement.";
        if (error.code === "RESPONSE_PACKAGE_VALIDATION_BLOCKED") return "Des pièces obligatoires manquent encore — corrigez-les avant de valider.";
        if (error.code === "PACKAGE_ARTIFACT_NOT_READY") return "Le dossier doit être validé avant de générer le ZIP final.";
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a response package action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function fetchResponsePackages(tenderId: string, lotId?: string): Promise<ResponsePackage[]> {
  const query = lotId ? `?lotId=${encodeURIComponent(lotId)}` : "";
  return appApiFetch<ResponsePackage[]>(`/api/v1/tenders/${tenderId}/response-packages${query}`);
}

export async function fetchResponsePackage(
  responsePackageId: string,
  versionId?: string,
): Promise<{ responsePackage: ResponsePackage; versions: ResponsePackageVersion[]; items: PackageItem[]; artifacts: PackageArtifact[] }> {
  const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
  return appApiFetch<{ responsePackage: ResponsePackage; versions: ResponsePackageVersion[]; items: PackageItem[]; artifacts: PackageArtifact[] }>(
    `/api/v1/response-packages/${responsePackageId}${query}`,
  );
}

export async function fetchPackageCompleteness(responsePackageId: string, versionId: string): Promise<PackageCompleteness> {
  return appApiFetch<PackageCompleteness>(`/api/v1/response-packages/${responsePackageId}/versions/${versionId}/completeness`);
}

export async function createResponsePackageAction(tenderId: string, lotId?: string): Promise<ResponsePackageActionState & { responsePackage?: ResponsePackage }> {
  try {
    const responsePackage = await appApiFetch<ResponsePackage>(`/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", body: JSON.stringify({ lotId }) });
    revalidatePath(`/app/tenders/${tenderId}/response-package`);
    return { responsePackage };
  } catch (error) {
    return { error: describeResponsePackageActionError(error) };
  }
}

export async function buildResponsePackageVersionAction(
  tenderId: string,
  responsePackageId: string,
): Promise<ResponsePackageActionState & { version?: ResponsePackageVersion; items?: PackageItem[] }> {
  try {
    const result = await appApiFetch<{ version: ResponsePackageVersion; items: PackageItem[] }>(`/api/v1/response-packages/${responsePackageId}/build`, { method: "POST" });
    revalidatePath(`/app/tenders/${tenderId}/response-package`);
    return result;
  } catch (error) {
    return { error: describeResponsePackageActionError(error) };
  }
}

export async function correctPackageItemQualificationAction(
  tenderId: string,
  responsePackageId: string,
  itemId: string,
  input: { requirementType: PackageItemRequirementType; applicabilityStatus: PackageItemApplicabilityStatus; conditionText?: string },
): Promise<ResponsePackageActionState & { item?: PackageItem }> {
  try {
    const item = await appApiFetch<PackageItem>(`/api/v1/response-packages/${responsePackageId}/items/${itemId}/qualification`, { method: "PATCH", body: JSON.stringify(input) });
    revalidatePath(`/app/tenders/${tenderId}/response-package`);
    return { item };
  } catch (error) {
    return { error: describeResponsePackageActionError(error) };
  }
}

export async function selectPackageItemDocumentAction(
  tenderId: string,
  responsePackageId: string,
  itemId: string,
  input: { documentId: string; documentVersionId: string },
): Promise<ResponsePackageActionState & { item?: PackageItem }> {
  try {
    const item = await appApiFetch<PackageItem>(`/api/v1/response-packages/${responsePackageId}/items/${itemId}/document`, { method: "PATCH", body: JSON.stringify(input) });
    revalidatePath(`/app/tenders/${tenderId}/response-package`);
    return { item };
  } catch (error) {
    return { error: describeResponsePackageActionError(error) };
  }
}

export async function validateResponsePackageVersionAction(
  tenderId: string,
  responsePackageId: string,
  versionId: string,
): Promise<ResponsePackageActionState & { version?: ResponsePackageVersion }> {
  try {
    const version = await appApiFetch<ResponsePackageVersion>(`/api/v1/response-packages/${responsePackageId}/versions/${versionId}/validate`, { method: "POST" });
    revalidatePath(`/app/tenders/${tenderId}/response-package`);
    return { version };
  } catch (error) {
    return { error: describeResponsePackageActionError(error) };
  }
}

/** Action EXPLICITE et SÉPARÉE de la validation (mission §55), jamais automatique. */
export async function generateResponsePackageZipAction(
  tenderId: string,
  responsePackageId: string,
  versionId: string,
): Promise<ResponsePackageActionState & { artifact?: PackageArtifact }> {
  try {
    const artifact = await appApiFetch<PackageArtifact>(`/api/v1/response-packages/${responsePackageId}/versions/${versionId}/generate`, { method: "POST" });
    revalidatePath(`/app/tenders/${tenderId}/response-package`);
    return { artifact };
  } catch (error) {
    return { error: describeResponsePackageActionError(error) };
  }
}
