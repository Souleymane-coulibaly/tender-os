/**
 * Checkpoint TENDEROS-2.1-CCV2-F — formes retournées par les APIs CandidateCompany V2
 * (CCV2-C capacités, CCV2-C.1 banking, CCV2-D documents).
 *
 * Ces types décrivent EXACTEMENT ce que le backend renvoie, jamais une forme reconstruite côté
 * interface. En particulier `temporalStatus` et l'IBAN masqué sont calculés par le backend : les
 * recalculer ici produirait une seconde vérité métier, divergente au premier changement de règle.
 */

/** Vocabulaire de validité temporelle (backend `TemporalValidityStatus`, fenêtre de 30 jours). */
export type TemporalValidityStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "NO_EXPIRY";

export const TEMPORAL_STATUS_LABELS: Record<TemporalValidityStatus, string> = {
  VALID: "Valide",
  EXPIRING_SOON: "Expire bientôt",
  EXPIRED: "Expirée",
  NO_EXPIRY: "Sans échéance",
};

export const TEMPORAL_STATUS_TONE: Record<TemporalValidityStatus, "success" | "warning" | "danger" | "neutral"> = {
  VALID: "success",
  EXPIRING_SOON: "warning",
  EXPIRED: "danger",
  NO_EXPIRY: "neutral",
};

/** Statut d'archivage porté par les satellites (`ACTIVE` | `ARCHIVED`, ou `DRAFT` pour une
 *  référence). Une capacité archivée reste visible en historique mais n'est plus exploitable. */
export type CapabilityStatus = string;

export type CandidateRepresentative = {
  id: string;
  candidateCompanyId: string;
  firstName: string;
  lastName: string;
  type: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  signatureScope: string | null;
  status: CapabilityStatus;
};

export type CandidateCertification = {
  id: string;
  candidateCompanyId: string;
  name: string;
  issuer: string | null;
  number: string | null;
  scope: string | null;
  obtainedAt: string | null;
  expiresAt: string | null;
  status: CapabilityStatus;
};

export type CandidateInsurance = {
  id: string;
  candidateCompanyId: string;
  type: string;
  otherTypeLabel: string | null;
  insurer: string | null;
  policyNumber: string | null;
  startDate: string | null;
  expiresAt: string | null;
  coverageScope: string | null;
  status: CapabilityStatus;
};

export type CandidateReference = {
  id: string;
  candidateCompanyId: string;
  projectName: string;
  referenceClientName: string | null;
  sector: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  amountValue: string | null;
  amountCurrency: string | null;
  confidentiality: string;
  status: CapabilityStatus;
};

export type CandidateHumanResource = {
  id: string;
  candidateCompanyId: string;
  category: string;
  title: string;
  headcount: number;
  qualification: string | null;
  averageExperienceYears: number | null;
  skills: string | null;
  status: CapabilityStatus;
};

export type CandidateMaterialResource = {
  id: string;
  candidateCompanyId: string;
  category: string;
  name: string;
  description: string | null;
  quantity: number;
  availabilityStatus: string;
  ownershipType: string | null;
  status: CapabilityStatus;
};

/**
 * Document d'entreprise candidate. `label` et `validFrom` peuvent être `null` — c'est le cas des
 * documents migrés depuis le Legacy (finding CCV2-E.1/P3-01) : aucune source ne les portait, et le
 * backfill a refusé de les inventer. L'interface DOIT les supporter sans jamais fabriquer de valeur.
 */
export type CandidateDocument = {
  documentId: string;
  candidateCompanyId: string;
  category: string;
  label: string | null;
  issuedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  temporalStatus: TemporalValidityStatus;
  createdAt: string;
};

export type CandidateDocumentVersion = {
  id: string;
  versionNumber: number;
  originalFilename: string;
  sizeBytes: number;
  createdAt: string;
};

/** Détail d'un document candidate : l'association + le Document du moteur documentaire. */
export type CandidateDocumentDetail = CandidateDocument & {
  document: {
    id: string;
    title: string;
    currentVersionNumber: number;
    currentVersion?: { id: string; originalFilename: string; sizeBytes: number } | null;
  };
};

/**
 * Compte bancaire candidate. `iban` arrive TOUJOURS masqué par le backend (`•••…1234`) : l'IBAN
 * complet ne quitte jamais l'API candidate (politique CCV2-C.1). L'interface l'affiche tel quel et
 * ne tente jamais de le reconstituer.
 */
export type CandidateBankAccount = {
  id: string;
  candidateCompanyId: string;
  accountHolder: string;
  bankName: string | null;
  iban: string;
  bic: string | null;
  currency: string | null;
  isPrimary: boolean;
  status: CapabilityStatus;
};

export const CANDIDATE_DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  KBIS: "Kbis / extrait d'immatriculation",
  TAX_CERTIFICATE: "Attestation fiscale",
  SOCIAL_CERTIFICATE: "Attestation sociale",
  ARTICLES_OF_ASSOCIATION: "Statuts",
  INSURANCE: "Assurance",
  CERTIFICATION: "Certification",
  BANK_DETAILS: "Coordonnées bancaires",
  REFERENCE: "Référence",
  POWER_OF_ATTORNEY: "Pouvoir / délégation",
  CV: "CV",
  OTHER: "Autre",
};

export const REPRESENTATIVE_TYPE_LABELS: Record<string, string> = {
  LEGAL_REPRESENTATIVE: "Représentant légal",
  SIGNATORY: "Signataire",
  ADMINISTRATIVE_CONTACT: "Contact administratif",
  COMMERCIAL_CONTACT: "Contact commercial",
  TECHNICAL_CONTACT: "Contact technique",
};

/** Libellé d'affichage d'un document. Repli VISUEL sur le titre du fichier quand `label` est nul —
 *  jamais persisté, jamais renvoyé au backend : c'est une commodité de lecture, pas une donnée. */
export function candidateDocumentDisplayLabel(document: CandidateDocument, filename?: string | null): string {
  const label = document.label?.trim();
  if (label) return label;
  const fallback = filename?.trim();
  if (fallback) return fallback;
  return CANDIDATE_DOCUMENT_CATEGORY_LABELS[document.category] ?? document.category;
}

/** Affichage d'une date optionnelle. Jamais de date inventée : l'absence est dite explicitement. */
export function formatOptionalDate(value: string | null | undefined): string {
  if (!value) return "Non renseigné";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Non renseigné";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Une capacité archivée ne doit jamais sembler exploitable. */
export function isArchived(status: CapabilityStatus): boolean {
  return status === "ARCHIVED";
}

/**
 * Checkpoint CCV2-F.1 — vue de l'historique des versions d'une pièce candidate.
 *
 * `currentVersionId` est le POINTEUR réel porté par le Document, pas le dernier élément de la
 * liste : c'est ce qui permet à l'interface de désigner la version courante sans la déduire.
 */
export type CandidateDocumentVersionsView = {
  versions: CandidateDocumentVersion[];
  currentVersionId?: string;
};

/** Taille lisible — jamais une estimation, toujours dérivée de l'octet exact renvoyé par l'API. */
export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} o`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} Ko`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} Mo`;
}
