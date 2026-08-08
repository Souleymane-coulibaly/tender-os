import type { ChecklistItem } from "../../../tenders";
import type { CompanyProfileSummary } from "../../../company-profile";
import type { DocumentSummary } from "../../../documents";
import type { SubcontractorCertificationRecord, SubcontractorInsuranceRecord } from "../../../subcontractors";

export type ChecklistDocumentCandidate = Readonly<{
  documentId: string;
  documentVersionId?: string | undefined;
  label: string;
  expiresAt?: Date | undefined;
  score: number;
  reasons: readonly string[];
}>;

export type ChecklistDocumentMatchResult = Readonly<{
  status: "EXACT_MATCH" | "PROBABLE_MATCH" | "MULTIPLE_CANDIDATES" | "NO_MATCH";
  candidates: readonly ChecklistDocumentCandidate[];
}>;

const EXACT_MATCH_THRESHOLD = 0.85;
const PROBABLE_MATCH_THRESHOLD = 0.5;
const MULTIPLE_CANDIDATES_MARGIN = 0.1;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalize(a).split(" ").filter(Boolean));
  const wordsB = new Set(normalize(b).split(" ").filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter((word) => wordsB.has(word)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** V2 Sprint 6 §5 — correspondance approximative entre le catalogue ChecklistItemType et les
 *  catégories/types réellement gouvernés côté satellites (company-profile/subcontractors). Pas de
 *  correspondance exhaustive nécessaire : sert uniquement de signal de score, jamais une décision. */
const TYPE_KEYWORDS: Record<string, readonly string[]> = {
  CERTIFICATION: ["certification", "certificat"],
  INSURANCE: ["assurance", "insurance"],
  ADMINISTRATIVE_DOCUMENT: ["kbis", "fiscale", "sociale", "attestation"],
};

function typeScore(item: ChecklistItem, candidateLabel: string, candidateKind: "CERTIFICATION" | "INSURANCE" | "OTHER"): number {
  if (item.type === candidateKind) return 1;
  const keywords = TYPE_KEYWORDS[item.type] ?? [];
  const normalizedLabel = normalize(candidateLabel);
  return keywords.some((keyword) => normalizedLabel.includes(keyword)) ? 0.6 : 0;
}

function scoreCandidate(item: ChecklistItem, label: string, candidateKind: "CERTIFICATION" | "INSURANCE" | "OTHER", expiresAt: Date | undefined): { score: number; reasons: string[] } {
  const titleScore = titleSimilarity(item.title, label);
  const kindScore = typeScore(item, label, candidateKind);
  const expiryConsistency = item.type === "CERTIFICATION" || item.type === "INSURANCE" ? (expiresAt !== undefined ? 1 : 0.5) : 0.5;

  const score = titleScore * 0.4 + kindScore * 0.4 + expiryConsistency * 0.2;
  const reasons: string[] = [`title~=${titleScore.toFixed(2)}`, `type~=${kindScore.toFixed(2)}`];
  return { score, reasons };
}

/**
 * V2 Sprint 6 §16-18 — rapprochement documentaire déterministe (aucun RAG/appel IA). Bassin de
 * candidats = documents du Tender + satellites (certifications/assurances) de l'entreprise
 * candidate et, si explicitement rattaché, du sous-traitant désigné. Ne décide JAMAIS d'une
 * association — retourne toujours une liste classée, l'attachement reste une action utilisateur
 * explicite (`AttachChecklistItemDocumentUseCase`), même sur un score EXACT_MATCH (mission §17
 * "jamais associer silencieusement").
 */
export function matchChecklistItemDocuments(input: {
  item: ChecklistItem;
  tenderDocuments: readonly DocumentSummary[];
  companyProfile?: CompanyProfileSummary | undefined;
  subcontractorCertifications?: readonly SubcontractorCertificationRecord[] | undefined;
  subcontractorInsurances?: readonly SubcontractorInsuranceRecord[] | undefined;
}): ChecklistDocumentMatchResult {
  const candidates: ChecklistDocumentCandidate[] = [];

  for (const document of input.tenderDocuments) {
    const { score, reasons } = scoreCandidate(input.item, document.title, "OTHER", undefined);
    candidates.push({ documentId: document.id, documentVersionId: document.currentVersion?.id, label: document.title, expiresAt: undefined, score, reasons });
  }

  for (const certification of input.companyProfile?.certifications ?? []) {
    if (!certification.documentId) continue;
    const { score, reasons } = scoreCandidate(input.item, certification.name, "CERTIFICATION", certification.expiresAt ?? undefined);
    candidates.push({ documentId: certification.documentId, label: certification.name, expiresAt: certification.expiresAt ?? undefined, score, reasons: [...reasons, "source=company_certification"] });
  }

  for (const insurance of input.companyProfile?.insurances ?? []) {
    if (!insurance.documentId) continue;
    const label = insurance.otherTypeLabel ?? insurance.type;
    const { score, reasons } = scoreCandidate(input.item, label, "INSURANCE", insurance.expiresAt ?? undefined);
    candidates.push({ documentId: insurance.documentId, label, expiresAt: insurance.expiresAt ?? undefined, score, reasons: [...reasons, "source=company_insurance"] });
  }

  for (const certification of input.subcontractorCertifications ?? []) {
    if (!certification.documentId) continue;
    const { score, reasons } = scoreCandidate(input.item, certification.name, "CERTIFICATION", certification.expiresAt ?? undefined);
    candidates.push({ documentId: certification.documentId, label: certification.name, expiresAt: certification.expiresAt ?? undefined, score, reasons: [...reasons, "source=subcontractor_certification"] });
  }

  for (const insurance of input.subcontractorInsurances ?? []) {
    if (!insurance.documentId) continue;
    const { score, reasons } = scoreCandidate(input.item, insurance.type, "INSURANCE", insurance.expiresAt ?? undefined);
    candidates.push({ documentId: insurance.documentId, label: insurance.type, expiresAt: insurance.expiresAt ?? undefined, score, reasons: [...reasons, "source=subcontractor_insurance"] });
  }

  const ranked = candidates.filter((candidate) => candidate.score >= PROBABLE_MATCH_THRESHOLD).sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return { status: "NO_MATCH", candidates: [] };
  }

  const top = ranked[0];
  if (!top) {
    return { status: "NO_MATCH", candidates: [] };
  }
  const contenders = ranked.filter((candidate) => top.score - candidate.score <= MULTIPLE_CANDIDATES_MARGIN);
  if (contenders.length > 1) {
    return { status: "MULTIPLE_CANDIDATES", candidates: ranked };
  }

  return { status: top.score >= EXACT_MATCH_THRESHOLD ? "EXACT_MATCH" : "PROBABLE_MATCH", candidates: ranked };
}
