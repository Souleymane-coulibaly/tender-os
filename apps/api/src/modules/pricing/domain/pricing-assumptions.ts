import { Decimal } from "@prisma/client/runtime/library";
import { InvalidPricingAssumptionError } from "./errors";

const MAX_GENERATIONS = 10_000;
const MAX_TOKENS_PER_GENERATION = 2_000_000;
const MAX_WORK_HOURS = 100_000;
const MAX_RATE = 100_000;
const MAX_HEADCOUNT = 1_000;
const MAX_NOTES_LENGTH = 2_000;

export type PricingAssumptionsProps = Readonly<{
  taskTypes?: readonly string[] | undefined;
  estimatedGenerationsCount?: number | undefined;
  estimatedInputTokensPerGeneration?: number | undefined;
  estimatedOutputTokensPerGeneration?: number | undefined;
  workHours?: number | undefined;
  hourlyRate?: string | undefined;
  headcount?: number | undefined;
  additionalFeesAmount?: string | undefined;
  notes?: string | undefined;
}>;

/**
 * Mission Sprint 7 §"Hypothèses de prévision" — "chaque hypothèse doit être nommée, typée, validée,
 * bornée, traçable, versionnée, affichable, non modifiable rétroactivement". Objet de VALEUR
 * immuable : une nouvelle version d'estimation porte un NOUVEL objet `PricingAssumptions`, jamais
 * une mutation de l'ancien (voir `PricingEstimateVersion`, jamais réécrite après création).
 */
export class PricingAssumptions {
  private constructor(private readonly props: PricingAssumptionsProps) {}

  static create(input: PricingAssumptionsProps): PricingAssumptions {
    assertBounded(input.estimatedGenerationsCount, 0, MAX_GENERATIONS, "estimatedGenerationsCount");
    assertBounded(input.estimatedInputTokensPerGeneration, 0, MAX_TOKENS_PER_GENERATION, "estimatedInputTokensPerGeneration");
    assertBounded(input.estimatedOutputTokensPerGeneration, 0, MAX_TOKENS_PER_GENERATION, "estimatedOutputTokensPerGeneration");
    assertBounded(input.workHours, 0, MAX_WORK_HOURS, "workHours");
    assertBounded(input.headcount, 0, MAX_HEADCOUNT, "headcount");

    if (input.hourlyRate !== undefined) assertRate(input.hourlyRate, "hourlyRate");
    if (input.additionalFeesAmount !== undefined) assertRate(input.additionalFeesAmount, "additionalFeesAmount");
    if (input.notes !== undefined && input.notes.length > MAX_NOTES_LENGTH) {
      throw new InvalidPricingAssumptionError(`notes must not exceed ${MAX_NOTES_LENGTH} characters`);
    }

    return new PricingAssumptions({
      taskTypes: input.taskTypes,
      estimatedGenerationsCount: input.estimatedGenerationsCount,
      estimatedInputTokensPerGeneration: input.estimatedInputTokensPerGeneration,
      estimatedOutputTokensPerGeneration: input.estimatedOutputTokensPerGeneration,
      workHours: input.workHours,
      hourlyRate: input.hourlyRate,
      headcount: input.headcount,
      additionalFeesAmount: input.additionalFeesAmount,
      notes: input.notes,
    });
  }

  toJSON(): PricingAssumptionsProps {
    return { ...this.props };
  }

  get taskTypes(): readonly string[] | undefined {
    return this.props.taskTypes;
  }
  get estimatedGenerationsCount(): number | undefined {
    return this.props.estimatedGenerationsCount;
  }
  get estimatedInputTokensPerGeneration(): number | undefined {
    return this.props.estimatedInputTokensPerGeneration;
  }
  get estimatedOutputTokensPerGeneration(): number | undefined {
    return this.props.estimatedOutputTokensPerGeneration;
  }
  get workHours(): number | undefined {
    return this.props.workHours;
  }
  get hourlyRate(): string | undefined {
    return this.props.hourlyRate;
  }
  get headcount(): number | undefined {
    return this.props.headcount;
  }
  get additionalFeesAmount(): string | undefined {
    return this.props.additionalFeesAmount;
  }
  get notes(): string | undefined {
    return this.props.notes;
  }
}

function assertBounded(value: number | undefined, min: number, max: number, field: string): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new InvalidPricingAssumptionError(`${field} must be between ${min} and ${max}`);
  }
}

/** Réaudit Codex Sprint 7 — "Decimal compromis par Number(...)" : un taux/montant saisi comme chaîne
 *  ne doit jamais transiter par un `Number` (imprécision en virgule flottante sur des décimales
 *  longues ou de grands montants) — validé exclusivement via `Decimal`, comme `Money`. */
function assertRate(value: string, field: string): void {
  let parsed: Decimal;
  try {
    parsed = new Decimal(value);
  } catch {
    throw new InvalidPricingAssumptionError(`${field} must be a non-negative number no greater than ${MAX_RATE}`);
  }
  if (!parsed.isFinite() || parsed.isNegative() || parsed.greaterThan(MAX_RATE)) {
    throw new InvalidPricingAssumptionError(`${field} must be a non-negative number no greater than ${MAX_RATE}`);
  }
}
