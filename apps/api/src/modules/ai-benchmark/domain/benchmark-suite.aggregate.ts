import { PromptKey } from "../../analysis";
import { BenchmarkSuiteStatus } from "./benchmark-suite-status";
import { BenchmarkSuiteEmptyError, BenchmarkSuiteNotDraftError } from "./errors";

export type BenchmarkSuiteProps = {
  id: string;
  name: string;
  version: number;
  promptKey: PromptKey;
  status: BenchmarkSuiteStatus;
  description?: string | undefined;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Suite de benchmark versionnée (Sprint 5.2 §"Corpus de benchmark") — le dispatch réel reste au
 * niveau `PromptKey` (décision de granularité déjà validée) : une suite est TOUJOURS liée à
 * exactement UN PromptKey, jamais une tâche métier fine. Immuable une fois `PUBLISHED` : toute
 * évolution du corpus crée une NOUVELLE version (nouvelle ligne, `version + 1`), jamais une
 * réécriture des cas d'une version déjà publiée — un `BenchmarkRun` référence toujours une version
 * de suite précise (`suiteVersion` capturé au lancement), jamais "la dernière".
 */
export class BenchmarkSuite {
  private constructor(private props: BenchmarkSuiteProps) {}

  static create(input: {
    id: string;
    name: string;
    version?: number | undefined;
    promptKey: PromptKey;
    description?: string | undefined;
    createdByUserId: string;
    occurredAt: Date;
  }): BenchmarkSuite {
    return new BenchmarkSuite({
      id: input.id,
      name: input.name,
      version: input.version ?? 1,
      promptKey: input.promptKey,
      status: BenchmarkSuiteStatus.Draft,
      description: input.description,
      createdByUserId: input.createdByUserId,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: BenchmarkSuiteProps): BenchmarkSuite {
    return new BenchmarkSuite(props);
  }

  assertMutable(): void {
    if (this.props.status !== BenchmarkSuiteStatus.Draft) {
      throw new BenchmarkSuiteNotDraftError();
    }
  }

  /** `hasAtLeastOneCase` est calculé par l'appelant (l'agrégat ne connaît pas ses cas — lus depuis
   *  un repository séparé) — jamais publiable vide (mission §"une suite doit contenir au moins un
   *  cas avant d'être publiée ou lancée"). */
  publish(hasAtLeastOneCase: boolean, occurredAt: Date): void {
    this.assertMutable();
    if (!hasAtLeastOneCase) {
      throw new BenchmarkSuiteEmptyError();
    }
    this.props.status = BenchmarkSuiteStatus.Published;
    this.props.updatedAt = occurredAt;
  }

  /** Nouvelle version en DRAFT, jamais une mutation de CETTE instance — l'appelant persiste les
   *  deux lignes séparément (l'ancienne reste PUBLISHED et inchangée). */
  nextDraftVersion(input: { id: string; createdByUserId: string; occurredAt: Date }): BenchmarkSuite {
    return BenchmarkSuite.create({
      id: input.id,
      name: this.props.name,
      version: this.props.version + 1,
      promptKey: this.props.promptKey,
      description: this.props.description,
      createdByUserId: input.createdByUserId,
      occurredAt: input.occurredAt,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get version(): number {
    return this.props.version;
  }
  get promptKey(): PromptKey {
    return this.props.promptKey;
  }
  get status(): BenchmarkSuiteStatus {
    return this.props.status;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get createdByUserId(): string {
    return this.props.createdByUserId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
