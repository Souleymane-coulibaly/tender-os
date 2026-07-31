import type { BenchmarkBusinessCategory, BenchmarkDifficulty, BenchmarkLanguage } from "./benchmark-difficulty";

export type BenchmarkCaseProps = {
  id: string;
  suiteId: string;
  inputVariables: Readonly<Record<string, string>>;
  expectedOutput: unknown;
  expectedProvenance?: unknown | undefined;
  difficulty: BenchmarkDifficulty;
  language: BenchmarkLanguage;
  businessCategory?: BenchmarkBusinessCategory | undefined;
  createdAt: Date;
};

/**
 * Cas de référence d'une suite (Sprint 5.2 §"Benchmark case") — immuable une fois créé (une suite
 * publiée ne peut plus recevoir de nouveaux cas, voir `BenchmarkSuite.assertMutable`). `expectedOutput`
 * et `expectedProvenance` sont volontairement `unknown` ici : leur forme dépend du `PromptKey` de la
 * suite parente, validée par l'évaluateur correspondant (Phase 3), jamais par le domaine.
 */
export class BenchmarkCase {
  private constructor(private props: BenchmarkCaseProps) {}

  static create(input: {
    id: string;
    suiteId: string;
    inputVariables: Readonly<Record<string, string>>;
    expectedOutput: unknown;
    expectedProvenance?: unknown | undefined;
    difficulty: BenchmarkDifficulty;
    language: BenchmarkLanguage;
    businessCategory?: BenchmarkBusinessCategory | undefined;
    occurredAt: Date;
  }): BenchmarkCase {
    return new BenchmarkCase({
      id: input.id,
      suiteId: input.suiteId,
      inputVariables: input.inputVariables,
      expectedOutput: input.expectedOutput,
      expectedProvenance: input.expectedProvenance,
      difficulty: input.difficulty,
      language: input.language,
      businessCategory: input.businessCategory,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: BenchmarkCaseProps): BenchmarkCase {
    return new BenchmarkCase(props);
  }

  get id(): string {
    return this.props.id;
  }
  get suiteId(): string {
    return this.props.suiteId;
  }
  get inputVariables(): Readonly<Record<string, string>> {
    return this.props.inputVariables;
  }
  get expectedOutput(): unknown {
    return this.props.expectedOutput;
  }
  get expectedProvenance(): unknown | undefined {
    return this.props.expectedProvenance;
  }
  get difficulty(): BenchmarkDifficulty {
    return this.props.difficulty;
  }
  get language(): BenchmarkLanguage {
    return this.props.language;
  }
  get businessCategory(): BenchmarkBusinessCategory | undefined {
    return this.props.businessCategory;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
