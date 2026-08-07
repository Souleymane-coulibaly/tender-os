import type { QuickScoreCompanyProfileInput, ScoredCategory } from "./compute-opportunity-quick-score";

/**
 * Fonctions pures partagées entre le Niveau 1 (`compute-opportunity-quick-score.ts`) et le Niveau 2
 * (`compute-go-no-go-report.ts`) — certifications, financier, ressources, références et planning
 * reposent sur EXACTEMENT le même signal métier (profil entreprise candidate / échéance) aux deux
 * niveaux, seul le poids diffère (`category-weights.ts`). Jamais dupliquées entre les deux fichiers
 * (règle CLAUDE.md "ne jamais dupliquer du code").
 */

export function scoreCertificationsFromProfile(
  companyProfile: QuickScoreCompanyProfileInput | undefined,
  weight: number,
  missingData: string[],
): ScoredCategory {
  if (!companyProfile) {
    missingData.push("Aucune certification connue — profil entreprise non rattaché.");
    return { score: 0, weight, justification: "Aucun profil entreprise disponible." };
  }
  const { validCertificationCount, expiredCertificationCount } = companyProfile;
  if (validCertificationCount === 0 && expiredCertificationCount === 0) {
    missingData.push("Aucune certification déclarée dans le profil entreprise.");
    return { score: 40, weight, justification: "Aucune certification déclarée." };
  }
  if (validCertificationCount === 0) {
    return { score: 10, weight, justification: `${expiredCertificationCount} certification(s) déclarée(s), toutes expirées.` };
  }
  return {
    score: 100,
    weight,
    justification: `${validCertificationCount} certification(s) valide(s)${expiredCertificationCount > 0 ? `, ${expiredCertificationCount} expirée(s)` : ""}.`,
  };
}

export function scoreFinancierMissingData(weight: number, missingData: string[]): ScoredCategory {
  // Décision assumée (mission §23, confirmée) — aucune capacité financière (chiffre d'affaires)
  // n'existe dans le profil entreprise : donnée manquante, jamais une valeur inventée.
  missingData.push("Capacité financière (chiffre d'affaires) non vérifiée — aucune donnée disponible ce sprint.");
  return { score: 50, weight, justification: "Capacité financière non vérifiée — donnée manquante, jamais inventée." };
}

export function scoreRessourcesFromProfile(
  companyProfile: QuickScoreCompanyProfileInput | undefined,
  weight: number,
  missingData: string[],
): ScoredCategory {
  if (!companyProfile) {
    missingData.push("Aucun profil entreprise disponible — donnée manquante.");
    return { score: 0, weight, justification: "Aucun profil entreprise disponible — donnée manquante." };
  }
  if (companyProfile.humanResourceCount === 0 && companyProfile.materialResourceCount === 0) {
    missingData.push("Aucune ressource humaine ou matérielle déclarée dans le profil entreprise.");
    return { score: 30, weight, justification: "Aucune ressource humaine/matérielle déclarée." };
  }
  return {
    score: 80,
    weight,
    justification: `${companyProfile.humanResourceCount} catégorie(s) de ressources humaines, ${companyProfile.materialResourceCount} de ressources matérielles déclarées.`,
  };
}

export function scoreReferencesFromProfile(
  companyProfile: QuickScoreCompanyProfileInput | undefined,
  weight: number,
  missingData: string[],
): ScoredCategory {
  if (!companyProfile || companyProfile.totalReferenceCount === 0) {
    missingData.push("Aucune référence déclarée dans le profil entreprise.");
    return { score: 0, weight, justification: "Aucune référence disponible." };
  }
  const score = Math.min(100, companyProfile.totalReferenceCount * 20);
  return { score, weight, justification: `${companyProfile.totalReferenceCount} référence(s) déclarée(s) au total.` };
}

export function scorePlanningFromDeadline(
  submissionDeadline: Date | undefined,
  now: Date,
  weight: number,
  missingData: string[],
): ScoredCategory {
  if (!submissionDeadline) {
    missingData.push("Aucune date limite connue pour évaluer le délai disponible.");
    return { score: 50, weight, justification: "Date limite inconnue — score neutre." };
  }
  const daysRemaining = Math.floor((submissionDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysRemaining < 0) {
    return { score: 0, weight, justification: "La date limite de dépôt est déjà passée." };
  }
  const score = Math.max(0, Math.min(100, Math.round((daysRemaining / 30) * 100)));
  return { score, weight, justification: `${daysRemaining} jour(s) restant(s) avant la date limite.` };
}
