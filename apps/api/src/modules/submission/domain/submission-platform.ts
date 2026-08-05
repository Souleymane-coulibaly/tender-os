/**
 * Sprint 9 — catalogue fermé des plateformes de dépôt (mission §10). Aucune connexion automatique
 * à ces plateformes n'est jamais implémentée (mission §3) — cette liste sert uniquement à qualifier
 * un dépôt MANUEL déjà réalisé par le Bid Manager. `Other`/`PlateformeAcheteur` autorisent un nom
 * libre contrôlé (`customPlatformName`, validé côté DTO) — jamais de credential stocké.
 */
export const SubmissionPlatform = {
  Place: "PLACE",
  AwsAchat: "AWS_ACHAT",
  MarchesSecurises: "MARCHES_SECURISES",
  Maximilien: "MAXIMILIEN",
  AchatPublic: "ACHATPUBLIC",
  Megalis: "MEGALIS",
  EMarchesPublics: "E_MARCHES_PUBLICS",
  PlateformeAcheteur: "PLATEFORME_ACHETEUR",
  Other: "OTHER",
} as const;

export type SubmissionPlatform = (typeof SubmissionPlatform)[keyof typeof SubmissionPlatform];

export function isSubmissionPlatform(value: string): value is SubmissionPlatform {
  return Object.values(SubmissionPlatform).includes(value as SubmissionPlatform);
}

/** Libellés FR — mission §10 "les libellés français doivent être présentés côté UI". */
export const SUBMISSION_PLATFORM_LABELS: Record<SubmissionPlatform, string> = {
  [SubmissionPlatform.Place]: "PLACE",
  [SubmissionPlatform.AwsAchat]: "AWS-Achat",
  [SubmissionPlatform.MarchesSecurises]: "Marchés Sécurisés",
  [SubmissionPlatform.Maximilien]: "Maximilien",
  [SubmissionPlatform.AchatPublic]: "AchatPublic",
  [SubmissionPlatform.Megalis]: "Mégalis",
  [SubmissionPlatform.EMarchesPublics]: "e-Marchés Publics",
  [SubmissionPlatform.PlateformeAcheteur]: "Plateforme acheteur (nom libre)",
  [SubmissionPlatform.Other]: "Autre",
};

/** Mission §10/§22 — un nom libre est exigé pour OTHER/PLATEFORME_ACHETEUR, jamais toléré vide. */
export function requiresCustomPlatformName(platform: SubmissionPlatform): boolean {
  return platform === SubmissionPlatform.Other || platform === SubmissionPlatform.PlateformeAcheteur;
}
