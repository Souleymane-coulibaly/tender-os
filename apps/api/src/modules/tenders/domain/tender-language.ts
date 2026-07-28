import { InvalidTenderLanguageError } from "./errors";

/**
 * Préparation internationale (mission architecture §12) — langue du marché, jamais utilisée pour
 * traduire l'UI ou l'IA dans cette tranche (hors périmètre explicite).
 */
export const TenderLanguage = {
  Fr: "fr",
  En: "en",
  De: "de",
  Es: "es",
  It: "it",
  Nl: "nl",
} as const;

export type TenderLanguage = (typeof TenderLanguage)[keyof typeof TenderLanguage];

export function isTenderLanguage(value: string): value is TenderLanguage {
  return Object.values(TenderLanguage).includes(value as TenderLanguage);
}

export function parseTenderLanguage(value: string): TenderLanguage {
  if (!isTenderLanguage(value)) {
    throw new InvalidTenderLanguageError(value);
  }
  return value;
}
