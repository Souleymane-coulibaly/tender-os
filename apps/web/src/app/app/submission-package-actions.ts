"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { SubmissionPackageSummary } from "../../lib/submission-package-types";

function describeSubmissionPackageActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] SubmissionPackage action failed (${error.status} ${error.code}): ${error.message}`);
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
        if (error.code === "DUPLICATE_ARCHIVE_PATH") return "Deux fichiers portent le même nom dans le package — conflit interne.";
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 422:
        if (error.code === "PACKAGE_NOT_READY") return "Le dossier n'est pas encore prêt : une approbation finale active et, le cas échéant, une signature vérifiée sont requises.";
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a submission package action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function createSubmissionPackageAction(tenderId: string): Promise<{ error?: string; pkg?: SubmissionPackageSummary }> {
  try {
    const pkg = await appApiFetch<SubmissionPackageSummary>(`/api/v1/tenders/${tenderId}/packages`, { method: "POST" });
    revalidatePath(`/app/tenders/${tenderId}/submission-package`);
    return { pkg };
  } catch (error) {
    return { error: describeSubmissionPackageActionError(error) };
  }
}
