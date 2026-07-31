import { clampScore, type QualityDimensionScores } from "./dimension-score";

export type BenchmarkCaseEvaluation = Readonly<{
  jsonValid: boolean;
  dimensions: QualityDimensionScores;
  /** Signaux bruts remontés à l'agrégation par modèle (Sprint 5.2 §"Seuils éliminatoires") — cette
   *  fonction reste par-CAS ; c'est l'agrégation (application) qui décide de l'élimination sur
   *  l'ensemble des cas d'un modèle (mission §"taux d'échec trop élevé", pas un seul cas isolé). */
  criticalHallucinationDetected: boolean;
  invalidProvenanceDetected: boolean;
  details: Record<string, unknown>;
}>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Rate d'hallucination au-delà duquel UN cas est considéré comme une hallucination "critique"
 *  (Sprint 5.2 §"hallucination critique") — pas un score continu ici, un signal binaire par cas. */
const CRITICAL_HALLUCINATION_RATE_THRESHOLD = 0.5;
/** En-dessous de ce ratio, une provenance déclarée attendue mais absente/incorrecte est jugée
 *  invalide (mission §"citation inexistante", "page incohérente"). */
const PROVENANCE_VALID_THRESHOLD = 0.5;

function compareAgainstExpected(expected: Record<string, unknown>, actual: unknown): {
  matchedCount: number;
  presentCount: number;
  hallucinatedCount: number;
  extraKeysCount: number;
  totalCount: number;
} {
  const totalCount = Object.keys(expected).length;
  if (!isPlainObject(actual)) {
    // Sortie non-objet alors qu'un objet était attendu : aucune correspondance possible, jamais
    // une exception — l'évaluateur doit rester total sur n'importe quelle sortie provider.
    return { matchedCount: 0, presentCount: 0, hallucinatedCount: 0, extraKeysCount: 0, totalCount };
  }

  let matchedCount = 0;
  let presentCount = 0;
  let hallucinatedCount = 0;

  for (const key of Object.keys(expected)) {
    const expectedValue = expected[key];
    const actualValue = actual[key];
    const expectedIsAbsence = expectedValue === null || expectedValue === undefined;

    if (actualValue !== undefined) presentCount += 1;

    if (expectedIsAbsence) {
      if (actualValue === null || actualValue === undefined) {
        matchedCount += 1;
      } else {
        // Le modèle a inventé une valeur là où le cas de référence n'en attend explicitement aucune.
        hallucinatedCount += 1;
      }
      continue;
    }

    if (deepEqual(expectedValue, actualValue)) {
      matchedCount += 1;
    }
  }

  const extraKeysCount = Object.keys(actual).filter((key) => !(key in expected)).length;

  return { matchedCount, presentCount, hallucinatedCount, extraKeysCount, totalCount };
}

/**
 * Évaluation déterministe d'un résultat de cas (Sprint 5.2 §"ÉVALUATION DÉTERMINISTE") — jamais un
 * "LLM-as-judge" : comparaison exacte/normalisée de champs contre le `expectedOutput`/
 * `expectedProvenance` déclarés par le cas. Ne lève jamais, quel que soit le contenu de
 * `rawOutput` — une sortie invalide obtient simplement des scores nuls plutôt qu'une exception qui
 * interromprait tout le run.
 *
 * Ce évaluateur v1 compare des champs top-level ; un `LlmJudgeEvaluator` reste un point
 * d'extension documenté mais non implémenté (mission §"peut être préparé comme option future,
 * ne doit jamais remplacer les tests déterministes").
 */
export function evaluateBenchmarkCaseOutput(input: {
  rawOutput: string;
  expectedOutput: unknown;
  expectedProvenance?: unknown | undefined;
}): BenchmarkCaseEvaluation {
  let parsed: unknown;
  let jsonValid = true;
  try {
    parsed = JSON.parse(input.rawOutput);
  } catch {
    jsonValid = false;
  }

  if (!jsonValid) {
    return {
      jsonValid: false,
      dimensions: {
        businessAccuracy: 0,
        hallucinationAbsence: 0,
        provenanceValidity: 0,
        completeness: 0,
        structuralConformity: 0,
      },
      criticalHallucinationDetected: false,
      invalidProvenanceDetected: false,
      details: { reason: "INVALID_JSON" },
    };
  }

  const expected = isPlainObject(input.expectedOutput) ? input.expectedOutput : {};
  const { matchedCount, presentCount, hallucinatedCount, extraKeysCount, totalCount } = compareAgainstExpected(expected, parsed);

  const businessAccuracy = totalCount === 0 ? 1 : clampScore(matchedCount / totalCount);
  const completeness = totalCount === 0 ? 1 : clampScore(presentCount / totalCount);

  const hallucinationDenominator = totalCount + extraKeysCount || 1;
  const hallucinationRate = (hallucinatedCount + extraKeysCount) / hallucinationDenominator;
  const hallucinationAbsence = clampScore(1 - hallucinationRate);
  const criticalHallucinationDetected = hallucinationRate > CRITICAL_HALLUCINATION_RATE_THRESHOLD;

  let provenanceValidity = 1;
  let invalidProvenanceDetected = false;
  if (isPlainObject(input.expectedProvenance)) {
    const provenanceComparison = compareAgainstExpected(
      input.expectedProvenance,
      isPlainObject(parsed) ? (parsed.provenance ?? parsed) : undefined,
    );
    provenanceValidity =
      provenanceComparison.totalCount === 0 ? 1 : clampScore(provenanceComparison.matchedCount / provenanceComparison.totalCount);
    invalidProvenanceDetected = provenanceValidity < PROVENANCE_VALID_THRESHOLD;
  }

  return {
    jsonValid: true,
    dimensions: {
      businessAccuracy,
      hallucinationAbsence,
      provenanceValidity,
      completeness,
      structuralConformity: 1,
    },
    criticalHallucinationDetected,
    invalidProvenanceDetected,
    details: { matchedCount, presentCount, hallucinatedCount, extraKeysCount, totalCount },
  };
}
