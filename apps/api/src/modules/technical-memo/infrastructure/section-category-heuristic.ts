import { TechnicalMemoSectionCategory } from "../domain/enums";

/**
 * Suggestion de catégorie déterministe par mots-clés du titre (mission §15/§47/§96 "pas besoin
 * d'un algorithme parfait mais une logique auditable, corrigible par l'utilisateur"). Jamais
 * appliquée comme confirmée — voir `TechnicalMemoSection.suggestCategory`.
 */
const KEYWORD_RULES: readonly { category: TechnicalMemoSectionCategory; keywords: readonly string[] }[] = [
  { category: TechnicalMemoSectionCategory.CompanyPresentation, keywords: ["présentation", "entreprise", "société", "qui sommes"] },
  { category: TechnicalMemoSectionCategory.Understanding, keywords: ["compréhension", "contexte", "enjeux", "besoin"] },
  { category: TechnicalMemoSectionCategory.Methodology, keywords: ["méthodologie", "méthode", "démarche", "approche"] },
  { category: TechnicalMemoSectionCategory.Organization, keywords: ["organisation", "pilotage", "gouvernance projet"] },
  { category: TechnicalMemoSectionCategory.Governance, keywords: ["gouvernance"] },
  { category: TechnicalMemoSectionCategory.HumanResources, keywords: ["moyens humains", "ressources humaines", "effectif", "équipe"] },
  { category: TechnicalMemoSectionCategory.TechnicalResources, keywords: ["moyens techniques", "matériel", "équipement", "outillage"] },
  { category: TechnicalMemoSectionCategory.Planning, keywords: ["planning", "calendrier", "délai", "échéancier"] },
  { category: TechnicalMemoSectionCategory.Quality, keywords: ["qualité"] },
  { category: TechnicalMemoSectionCategory.Security, keywords: ["sécurité", "prévention"] },
  { category: TechnicalMemoSectionCategory.Environment, keywords: ["environnement", "écologique", "développement durable"] },
  { category: TechnicalMemoSectionCategory.Csr, keywords: ["rse", "responsabilité sociétale", "social"] },
  { category: TechnicalMemoSectionCategory.Continuity, keywords: ["continuité", "plan de secours", "pca"] },
  { category: TechnicalMemoSectionCategory.References, keywords: ["référence", "expérience similaire"] },
  { category: TechnicalMemoSectionCategory.Innovation, keywords: ["innovation", "valeur ajoutée"] },
];

const DIACRITIC_PATTERN = /\p{Diacritic}/gu;

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(DIACRITIC_PATTERN, "");
}

export function suggestSectionCategory(title: string): TechnicalMemoSectionCategory {
  const normalizedTitle = normalize(title);
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => normalizedTitle.includes(normalize(keyword)))) {
      return rule.category;
    }
  }
  return TechnicalMemoSectionCategory.NeedsMapping;
}
