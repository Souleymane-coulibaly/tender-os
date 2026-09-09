import type { CandidateCapabilitiesSummary } from "../../../../company-profile";

/**
 * Checkpoint TENDEROS-2.1-CCV2-E — coordonnées de contact de l'entreprise candidate pour les
 * formulaires officiels (DC1/DC2/DC4, Acte d'engagement).
 *
 * Ferme le trou identifié en CCV2-01 (P0-02) : en NEW FLOW, `candidate.email` et `candidate.phone`
 * restaient DÉFINITIVEMENT `MISSING`, parce qu'aucune source candidate-native n'existait — la
 * correction F3.1 avait à juste titre supprimé l'emprunt au client commercial, sans pouvoir le
 * remplacer. `CompanyRepresentative`, désormais rattaché à `CandidateCompany` (CCV2-B/C), fournit
 * cette source.
 *
 * ORDRE DE PRÉFÉRENCE EXPLICITE, jamais « le premier trouvé » : un contact administratif déclaré
 * prime sur un représentant légal, qui prime sur un signataire, qui prime sur tout autre. Ce choix
 * suit le rôle réellement attendu dans un formulaire de candidature — la personne à qui l'acheteur
 * écrit — et reste stable quel que soit l'ordre d'insertion en base.
 *
 * Ne fabrique JAMAIS une valeur : si aucun représentant ne porte de courriel, le champ reste
 * absent et le formulaire le signale `MISSING`, exactement comme aujourd'hui.
 */
const CONTACT_TYPE_PRIORITY: readonly string[] = ["ADMINISTRATIVE_CONTACT", "LEGAL_REPRESENTATIVE", "SIGNATORY", "COMMERCIAL_CONTACT", "TECHNICAL_CONTACT"];

export type CandidateContact = Readonly<{
  email?: string | undefined;
  phone?: string | undefined;
  /** Nom complet du représentant retenu — utile aux formulaires qui nomment le signataire. */
  fullName?: string | undefined;
  type?: string | undefined;
}>;

function rank(type: string): number {
  const index = CONTACT_TYPE_PRIORITY.indexOf(type);
  return index === -1 ? CONTACT_TYPE_PRIORITY.length : index;
}

/** Sélectionne le représentant le mieux placé qui porte RÉELLEMENT le champ demandé : un contact
 *  administratif sans courriel ne doit pas masquer un représentant légal qui en a un. */
function pick(capabilities: CandidateCapabilitiesSummary, field: "email" | "phone"): CandidateContact | undefined {
  const carrying = capabilities.representatives.filter((representative) => {
    const value = field === "email" ? representative.email : representative.phone;
    return value !== null && value !== undefined && value.trim() !== "";
  });
  if (carrying.length === 0) {
    return undefined;
  }
  const best = [...carrying].sort((a, b) => rank(a.type) - rank(b.type))[0]!;
  return {
    email: best.email ?? undefined,
    phone: best.phone ?? undefined,
    fullName: `${best.firstName} ${best.lastName}`.trim(),
    type: best.type,
  };
}

export function resolveCandidateContact(capabilities: CandidateCapabilitiesSummary): CandidateContact {
  const emailHolder = pick(capabilities, "email");
  const phoneHolder = pick(capabilities, "phone");
  return {
    email: emailHolder?.email,
    phone: phoneHolder?.phone,
    fullName: emailHolder?.fullName ?? phoneHolder?.fullName,
    type: emailHolder?.type ?? phoneHolder?.type,
  };
}
