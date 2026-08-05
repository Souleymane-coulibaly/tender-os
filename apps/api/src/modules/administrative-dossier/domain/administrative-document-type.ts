/**
 * Sprint 8C Phase 1 — catalogue canonique BACKEND des types de pièces du dossier administratif
 * (mission §7 "le frontend ne doit pas maintenir une liste divergente codée en dur"). Un code n'a
 * ici AUCUNE notion d'obligation : le caractère obligatoire est déterminé par Tender via
 * `AdministrativeRequirement`, jamais globalement sur le catalogue (mission §7).
 */
export const AdministrativeDocumentType = {
  Dc1: "DC1",
  Dc2: "DC2",
  Dc4: "DC4",
  Dume: "DUME",
  ActeEngagement: "ACTE_ENGAGEMENT",
  KbisOrEquivalent: "K_BIS_OR_EQUIVALENT",
  AttestationFiscale: "ATTESTATION_FISCALE",
  AttestationSociale: "ATTESTATION_SOCIALE",
  AttestationAssurance: "ATTESTATION_ASSURANCE",
  PouvoirSignature: "POUVOIR_SIGNATURE",
  DelegationSignature: "DELEGATION_SIGNATURE",
  Rib: "RIB",
  CertificatQualification: "CERTIFICAT_QUALIFICATION",
  ReferencesProfessionnelles: "REFERENCES_PROFESSIONNELLES",
  CapacitesTechniques: "CAPACITES_TECHNIQUES",
  CapacitesFinancieres: "CAPACITES_FINANCIERES",
  DeclarationChiffreAffaires: "DECLARATION_CHIFFRE_AFFAIRES",
  ListeMoyensHumains: "LISTE_MOYENS_HUMAINS",
  ListeMoyensTechniques: "LISTE_MOYENS_TECHNIQUES",
  DocumentGroupement: "DOCUMENT_GROUPEMENT",
  DocumentSousTraitance: "DOCUMENT_SOUS_TRAITANCE",
  DocumentAcheteurSpecifique: "DOCUMENT_ACHETEUR_SPECIFIQUE",
  Other: "OTHER",
} as const;

export type AdministrativeDocumentType = (typeof AdministrativeDocumentType)[keyof typeof AdministrativeDocumentType];

export function isAdministrativeDocumentType(value: string): value is AdministrativeDocumentType {
  return Object.values(AdministrativeDocumentType).includes(value as AdministrativeDocumentType);
}

export const AdministrativeDocumentCategory = {
  Candidature: "CANDIDATURE",
  IdentiteLegale: "IDENTITE_LEGALE",
  FiscalSocial: "FISCAL_SOCIAL",
  Capacites: "CAPACITES",
  SignaturePouvoirs: "SIGNATURE_POUVOIRS",
  GroupementSousTraitance: "GROUPEMENT_SOUS_TRAITANCE",
  DocumentAcheteur: "DOCUMENT_ACHETEUR",
  Autre: "AUTRE",
} as const;

export type AdministrativeDocumentCategory = (typeof AdministrativeDocumentCategory)[keyof typeof AdministrativeDocumentCategory];

export type AdministrativeDocumentTypeMetadata = Readonly<{
  code: AdministrativeDocumentType;
  label: string;
  category: AdministrativeDocumentCategory;
  description: string;
  hasValidityPeriod: boolean;
  canRequireSignature: boolean;
}>;

/** Métadonnées descriptives uniquement — jamais un caractère obligatoire (mission §7). */
export const ADMINISTRATIVE_DOCUMENT_TYPE_METADATA: Readonly<Record<AdministrativeDocumentType, AdministrativeDocumentTypeMetadata>> = {
  [AdministrativeDocumentType.Dc1]: {
    code: AdministrativeDocumentType.Dc1,
    label: "DC1 — Lettre de candidature",
    category: AdministrativeDocumentCategory.Candidature,
    description: "Identifie le candidat (individuel ou groupement) et son mandataire.",
    hasValidityPeriod: false,
    canRequireSignature: true,
  },
  [AdministrativeDocumentType.Dc2]: {
    code: AdministrativeDocumentType.Dc2,
    label: "DC2 — Déclaration du candidat",
    category: AdministrativeDocumentCategory.Candidature,
    description: "Capacités économiques, financières, techniques et professionnelles du candidat.",
    hasValidityPeriod: false,
    canRequireSignature: true,
  },
  [AdministrativeDocumentType.Dc4]: {
    code: AdministrativeDocumentType.Dc4,
    label: "DC4 — Déclaration de sous-traitance",
    category: AdministrativeDocumentCategory.Candidature,
    description: "Une déclaration par sous-traitant déclaré.",
    hasValidityPeriod: false,
    canRequireSignature: true,
  },
  [AdministrativeDocumentType.Dume]: {
    code: AdministrativeDocumentType.Dume,
    label: "DUME — Document unique de marché européen",
    category: AdministrativeDocumentCategory.Candidature,
    description: "Auto-déclaration européenne de conformité et de capacités.",
    hasValidityPeriod: false,
    canRequireSignature: true,
  },
  [AdministrativeDocumentType.ActeEngagement]: {
    code: AdministrativeDocumentType.ActeEngagement,
    label: "Acte d'engagement",
    category: AdministrativeDocumentCategory.Candidature,
    description: "Engagement contractuel du candidat sur l'offre, montant et délais.",
    hasValidityPeriod: false,
    canRequireSignature: true,
  },
  [AdministrativeDocumentType.KbisOrEquivalent]: {
    code: AdministrativeDocumentType.KbisOrEquivalent,
    label: "Extrait K ou Kbis (ou équivalent)",
    category: AdministrativeDocumentCategory.IdentiteLegale,
    description: "Preuve d'immatriculation légale du candidat.",
    hasValidityPeriod: true,
    canRequireSignature: false,
  },
  [AdministrativeDocumentType.AttestationFiscale]: {
    code: AdministrativeDocumentType.AttestationFiscale,
    label: "Attestation de régularité fiscale",
    category: AdministrativeDocumentCategory.FiscalSocial,
    description: "Preuve de régularité fiscale délivrée par l'administration.",
    hasValidityPeriod: true,
    canRequireSignature: false,
  },
  [AdministrativeDocumentType.AttestationSociale]: {
    code: AdministrativeDocumentType.AttestationSociale,
    label: "Attestation de régularité sociale",
    category: AdministrativeDocumentCategory.FiscalSocial,
    description: "Preuve de régularité sociale (URSSAF ou équivalent).",
    hasValidityPeriod: true,
    canRequireSignature: false,
  },
  [AdministrativeDocumentType.AttestationAssurance]: {
    code: AdministrativeDocumentType.AttestationAssurance,
    label: "Attestation d'assurance",
    category: AdministrativeDocumentCategory.Capacites,
    description: "Preuve de couverture d'assurance (responsabilité civile professionnelle, etc.).",
    hasValidityPeriod: true,
    canRequireSignature: false,
  },
  [AdministrativeDocumentType.PouvoirSignature]: {
    code: AdministrativeDocumentType.PouvoirSignature,
    label: "Pouvoir de signature",
    category: AdministrativeDocumentCategory.SignaturePouvoirs,
    description: "Preuve du pouvoir du signataire à engager le candidat.",
    hasValidityPeriod: true,
    canRequireSignature: false,
  },
  [AdministrativeDocumentType.DelegationSignature]: {
    code: AdministrativeDocumentType.DelegationSignature,
    label: "Délégation de signature",
    category: AdministrativeDocumentCategory.SignaturePouvoirs,
    description: "Délégation explicite d'un pouvoir de signature à un tiers.",
    hasValidityPeriod: true,
    canRequireSignature: false,
  },
  [AdministrativeDocumentType.Rib]: {
    code: AdministrativeDocumentType.Rib,
    label: "RIB",
    category: AdministrativeDocumentCategory.IdentiteLegale,
    description: "Coordonnées bancaires du candidat.",
    hasValidityPeriod: false,
    canRequireSignature: false,
  },
  [AdministrativeDocumentType.CertificatQualification]: {
    code: AdministrativeDocumentType.CertificatQualification,
    label: "Certificat de qualification",
    category: AdministrativeDocumentCategory.Capacites,
    description: "Certification professionnelle ou technique délivrée par un organisme tiers.",
    hasValidityPeriod: true,
    canRequireSignature: false,
  },
  [AdministrativeDocumentType.ReferencesProfessionnelles]: {
    code: AdministrativeDocumentType.ReferencesProfessionnelles,
    label: "Références professionnelles",
    category: AdministrativeDocumentCategory.Capacites,
    description: "Liste de prestations similaires réalisées.",
    hasValidityPeriod: false,
    canRequireSignature: false,
  },
  [AdministrativeDocumentType.CapacitesTechniques]: {
    code: AdministrativeDocumentType.CapacitesTechniques,
    label: "Capacités techniques",
    category: AdministrativeDocumentCategory.Capacites,
    description: "Description des moyens techniques du candidat.",
    hasValidityPeriod: false,
    canRequireSignature: false,
  },
  [AdministrativeDocumentType.CapacitesFinancieres]: {
    code: AdministrativeDocumentType.CapacitesFinancieres,
    label: "Capacités financières",
    category: AdministrativeDocumentCategory.Capacites,
    description: "Description de la solidité financière du candidat.",
    hasValidityPeriod: false,
    canRequireSignature: false,
  },
  [AdministrativeDocumentType.DeclarationChiffreAffaires]: {
    code: AdministrativeDocumentType.DeclarationChiffreAffaires,
    label: "Déclaration de chiffre d'affaires",
    category: AdministrativeDocumentCategory.Capacites,
    description: "Déclaration du chiffre d'affaires sur les derniers exercices.",
    hasValidityPeriod: false,
    canRequireSignature: true,
  },
  [AdministrativeDocumentType.ListeMoyensHumains]: {
    code: AdministrativeDocumentType.ListeMoyensHumains,
    label: "Liste des moyens humains",
    category: AdministrativeDocumentCategory.Capacites,
    description: "Effectifs et qualifications mobilisables pour le marché.",
    hasValidityPeriod: false,
    canRequireSignature: false,
  },
  [AdministrativeDocumentType.ListeMoyensTechniques]: {
    code: AdministrativeDocumentType.ListeMoyensTechniques,
    label: "Liste des moyens techniques",
    category: AdministrativeDocumentCategory.Capacites,
    description: "Matériel et outillages mobilisables pour le marché.",
    hasValidityPeriod: false,
    canRequireSignature: false,
  },
  [AdministrativeDocumentType.DocumentGroupement]: {
    code: AdministrativeDocumentType.DocumentGroupement,
    label: "Document de groupement",
    category: AdministrativeDocumentCategory.GroupementSousTraitance,
    description: "Convention ou pièce décrivant le groupement (mandataire, membres, répartition).",
    hasValidityPeriod: false,
    canRequireSignature: true,
  },
  [AdministrativeDocumentType.DocumentSousTraitance]: {
    code: AdministrativeDocumentType.DocumentSousTraitance,
    label: "Document de sous-traitance",
    category: AdministrativeDocumentCategory.GroupementSousTraitance,
    description: "Pièce complémentaire relative à un sous-traitant déclaré.",
    hasValidityPeriod: false,
    canRequireSignature: true,
  },
  [AdministrativeDocumentType.DocumentAcheteurSpecifique]: {
    code: AdministrativeDocumentType.DocumentAcheteurSpecifique,
    label: "Document spécifique imposé par l'acheteur",
    category: AdministrativeDocumentCategory.DocumentAcheteur,
    description: "Modèle ou pièce imposée par le DCE de cette consultation précise.",
    hasValidityPeriod: false,
    canRequireSignature: true,
  },
  [AdministrativeDocumentType.Other]: {
    code: AdministrativeDocumentType.Other,
    label: "Autre pièce",
    category: AdministrativeDocumentCategory.Autre,
    description: "Toute autre pièce administrative non couverte par un code dédié.",
    hasValidityPeriod: false,
    canRequireSignature: false,
  },
};
