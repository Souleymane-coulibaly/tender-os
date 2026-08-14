// V2 Sprint 23 (landing) — mission §37-43. Consentement cookies : structure versionnée, jamais un
// simple booléen "accepted=true" (une politique qui change substantiellement doit pouvoir
// redemander le consentement, §41). Aucune donnée envoyée à un serveur : localStorage uniquement
// (mission §40 "pas besoin de Postgres").

/** Incrémenter UNIQUEMENT si la politique change substantiellement (nouvelle catégorie, nouveau
 *  sous-traitant) — mission §41. Une politique inchangée ne doit jamais redemander le consentement. */
export const CONSENT_POLICY_VERSION = 1;

export const CONSENT_STORAGE_KEY = "tenderos_cookie_consent";

export type ConsentCategories = Readonly<{
  /** Toujours `true` — jamais désactivable (mission §38 "Nécessaires — toujours actifs"). */
  necessary: true;
  /** Google Analytics 4 — OFF par défaut (mission §38). */
  analytics: boolean;
  /** Crisp — OFF par défaut (mission §38). */
  support: boolean;
}>;

export type StoredConsent = ConsentCategories & Readonly<{ version: number; updatedAt: string }>;

export const DEFAULT_CONSENT: ConsentCategories = { necessary: true, analytics: false, support: false };

function isStoredConsent(value: unknown): value is StoredConsent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.version === "number" &&
    typeof candidate.updatedAt === "string" &&
    candidate.necessary === true &&
    typeof candidate.analytics === "boolean" &&
    typeof candidate.support === "boolean"
  );
}

/** `null` = pas encore de choix valide pour la version COURANTE de la politique (première visite,
 *  OU une politique antérieure a changé substantiellement, §41) — le banner doit alors s'afficher. */
export function readStoredConsent(): StoredConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredConsent(parsed) || parsed.version !== CONSENT_POLICY_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredConsent(categories: ConsentCategories): StoredConsent {
  const stored: StoredConsent = { ...categories, version: CONSENT_POLICY_VERSION, updatedAt: new Date().toISOString() };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Stockage indisponible (mode privé strict, quota) — jamais un crash, le consentement reste
      // simplement redemandé à la prochaine visite (comportement identique à la première visite).
    }
  }
  return stored;
}

export const ACCEPT_ALL_CONSENT: ConsentCategories = { necessary: true, analytics: true, support: true };
export const REJECT_ALL_CONSENT: ConsentCategories = { necessary: true, analytics: false, support: false };
