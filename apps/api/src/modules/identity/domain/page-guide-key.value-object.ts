import { InvalidPageGuideKeyError } from "./errors";

/** Forme unique d'une clé de guide de page — minuscules, chiffres et tirets, 1 à 64 caractères.
 *  Partagée par le schéma HTTP (première ligne de contrôle) et ce value object (défense en
 *  profondeur), jamais deux expressions divergentes. */
export const PAGE_GUIDE_KEY_PATTERN = /^[a-z0-9-]{1,64}$/;

/**
 * TENDEROS-2.1 (guides de page) — identifiant d'un guide contextuel (un par écran). L'API ne
 * détient volontairement AUCUNE liste fermée de guides : le registre vit dans l'application web.
 * Seule la forme est un invariant ici (longueur bornée = colonne VARCHAR(64), alphabet restreint =
 * aucune clé exotique persistée).
 */
export class PageGuideKey {
  private constructor(readonly value: string) {}

  static from(value: string): PageGuideKey {
    if (!PAGE_GUIDE_KEY_PATTERN.test(value)) {
      throw new InvalidPageGuideKeyError(value);
    }

    return new PageGuideKey(value);
  }
}
