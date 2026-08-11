/**
 * Mission §20 — normalisation case-insensitive + accents ("si possible") + tokenisation
 * raisonnable. Pure, sans I/O. `includeKeywords` : HARD filter si non vide (au moins une phrase
 * doit apparaitre — critere principal du mode simple, mission §96) ; `excludeKeywords` : TOUJOURS
 * un HARD filter (une seule raison d'exclusion suffit). Le nombre de mots-cles effectivement
 * trouves alimente ensuite le score explicable (mission §29 "Mots-cles : 4/5").
 */

// Plage Unicode "Combining Diacritical Marks" (U+0300-U+036F), exprimee en points de code
// numeriques plutot qu'en echappement regex litteral \uXXXX — evite toute ambiguite
// d'encodage/transcription du caractere combinant lui-meme dans le fichier source.
const COMBINING_MARKS_RANGE_START = 0x0300;
const COMBINING_MARKS_RANGE_END = 0x036f;

function stripDiacritics(text: string): string {
  let result = "";
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint < COMBINING_MARKS_RANGE_START || codePoint > COMBINING_MARKS_RANGE_END) {
      result += char;
    }
  }
  return result;
}

export function normalizeSearchableText(text: string): string {
  return stripDiacritics(text.normalize("NFD"))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function textContainsKeyword(haystack: string, keyword: string): boolean {
  const normalizedKeyword = normalizeSearchableText(keyword);
  if (normalizedKeyword.length === 0) return false;
  return normalizeSearchableText(haystack).includes(normalizedKeyword);
}

export function countMatchedIncludeKeywords(haystack: string, includeKeywords: readonly string[]): number {
  return includeKeywords.filter((keyword) => textContainsKeyword(haystack, keyword)).length;
}

export function keywordFilterPasses(haystack: string, includeKeywords: readonly string[], excludeKeywords: readonly string[]): boolean {
  if (excludeKeywords.some((keyword) => textContainsKeyword(haystack, keyword))) {
    return false;
  }
  if (includeKeywords.length > 0 && countMatchedIncludeKeywords(haystack, includeKeywords) === 0) {
    return false;
  }
  return true;
}
