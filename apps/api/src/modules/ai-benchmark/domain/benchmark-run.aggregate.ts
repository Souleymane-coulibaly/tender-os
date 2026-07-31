import { ALLOWED_BENCHMARK_RUN_TRANSITIONS, BenchmarkRunStatus } from "./benchmark-run-status";
import { InvalidBenchmarkRunStatusTransitionError, InvalidBenchmarkRunParametersError } from "./errors";

export type BenchmarkRunProps = {
  id: string;
  organizationId: string;
  suiteId: string;
  suiteVersion: number;
  status: BenchmarkRunStatus;
  repetitions: number;
  concurrencyLimit: number;
  estimatedCostAmount: string;
  estimatedCostCurrency: string;
  costCeilingAmount?: string | undefined;
  launchedByUserId: string;
  launchedAt: Date;
  startedAt?: Date | undefined;
  completedAt?: Date | undefined;
  cancelRequestedAt?: Date | undefined;
  cancelledByUserId?: string | undefined;
  lastErrorCode?: string | undefined;
  staleRecoveryAttempts: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Audit Codex P1-3 — au-delà de ce nombre de reprises depuis un état RUNNING "stale", un run
 *  n'est plus remis en PENDING : il est marqué FAILED explicitement (jamais une boucle infinie de
 *  tentatives). */
export const MAX_STALE_RECOVERY_ATTEMPTS = 3;

export const MAX_BENCHMARK_REPETITIONS = 5;
export const MAX_BENCHMARK_CONCURRENCY = 5;

/**
 * Exécution d'un benchmark (Sprint 5.2 §"Exécution du benchmark") — statut PENDING au lancement
 * (mission §"réservation courte"), jamais RUNNING directement : `start()` est appelé par le
 * dispatcher juste avant le premier appel provider, `complete()` une seule fois à la toute fin,
 * jamais une mutation de statut ailleurs. Bornes de coût/répétitions/concurrence vérifiées à la
 * création (mission §"Prévoir une limite configurable"), jamais laissées à la discrétion du
 * dispatcher.
 */
export class BenchmarkRun {
  private constructor(private props: BenchmarkRunProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    suiteId: string;
    suiteVersion: number;
    repetitions: number;
    concurrencyLimit: number;
    estimatedCostAmount: string;
    estimatedCostCurrency: string;
    costCeilingAmount?: string | undefined;
    launchedByUserId: string;
    occurredAt: Date;
  }): BenchmarkRun {
    if (input.repetitions < 1 || input.repetitions > MAX_BENCHMARK_REPETITIONS) {
      throw new InvalidBenchmarkRunParametersError(
        `repetitions must be between 1 and ${MAX_BENCHMARK_REPETITIONS} (got ${input.repetitions}).`,
      );
    }
    if (input.concurrencyLimit < 1 || input.concurrencyLimit > MAX_BENCHMARK_CONCURRENCY) {
      throw new InvalidBenchmarkRunParametersError(
        `concurrencyLimit must be between 1 and ${MAX_BENCHMARK_CONCURRENCY} (got ${input.concurrencyLimit}).`,
      );
    }

    return new BenchmarkRun({
      id: input.id,
      organizationId: input.organizationId,
      suiteId: input.suiteId,
      suiteVersion: input.suiteVersion,
      status: BenchmarkRunStatus.Pending,
      repetitions: input.repetitions,
      concurrencyLimit: input.concurrencyLimit,
      estimatedCostAmount: input.estimatedCostAmount,
      estimatedCostCurrency: input.estimatedCostCurrency,
      costCeilingAmount: input.costCeilingAmount,
      launchedByUserId: input.launchedByUserId,
      launchedAt: input.occurredAt,
      staleRecoveryAttempts: 0,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: BenchmarkRunProps): BenchmarkRun {
    return new BenchmarkRun(props);
  }

  private transitionTo(next: BenchmarkRunStatus, occurredAt: Date): void {
    const allowed = ALLOWED_BENCHMARK_RUN_TRANSITIONS[this.props.status];
    if (!allowed.includes(next)) {
      throw new InvalidBenchmarkRunStatusTransitionError({ from: this.props.status, to: next });
    }
    this.props.status = next;
    this.props.updatedAt = occurredAt;
  }

  start(occurredAt: Date): void {
    this.transitionTo(BenchmarkRunStatus.Running, occurredAt);
    this.props.startedAt = occurredAt;
  }

  complete(outcome: typeof BenchmarkRunStatus.Succeeded | typeof BenchmarkRunStatus.PartiallySucceeded | typeof BenchmarkRunStatus.Failed, occurredAt: Date): void {
    this.transitionTo(outcome, occurredAt);
    this.props.completedAt = occurredAt;
  }

  /** Signal COOPÉRATIF (mission §"annulation") — ne transitionne PAS immédiatement vers CANCELLED :
   *  le dispatcher vérifie `cancelRequested` entre deux cas/répétitions et transitionne lui-même
   *  via `cancel()` une fois arrêté proprement, jamais une interruption brutale à mi-appel provider. */
  requestCancel(actorId: string, occurredAt: Date): void {
    this.props.cancelRequestedAt = occurredAt;
    this.props.cancelledByUserId = actorId;
    this.props.updatedAt = occurredAt;
  }

  get cancelRequested(): boolean {
    return this.props.cancelRequestedAt !== undefined;
  }

  cancel(occurredAt: Date): void {
    this.transitionTo(BenchmarkRunStatus.Cancelled, occurredAt);
    this.props.completedAt = occurredAt;
  }

  /** Audit Codex P1-3 — appelée uniquement par `RecoverStaleBenchmarkRunsUseCase` pour un run
   *  RUNNING dont `updatedAt` n'a plus progressé depuis le seuil configuré (crash/redéploiement
   *  présumé). Idempotent côté compteur : chaque appel incrémente `staleRecoveryAttempts` une seule
   *  fois. Retombe en PENDING (retry contrôlé, jamais un nouveau `BenchmarkRun`) tant que le nombre
   *  maximal de tentatives n'est pas atteint, sinon transitionne directement vers FAILED — jamais
   *  une boucle infinie de reprises. */
  recoverFromStale(input: { occurredAt: Date; errorCode: string; maxAttempts: number }): "retried" | "exhausted" {
    this.props.staleRecoveryAttempts += 1;
    this.props.lastErrorCode = input.errorCode;

    if (this.props.staleRecoveryAttempts > input.maxAttempts) {
      this.transitionTo(BenchmarkRunStatus.Failed, input.occurredAt);
      this.props.completedAt = input.occurredAt;
      return "exhausted";
    }

    this.transitionTo(BenchmarkRunStatus.Pending, input.occurredAt);
    return "retried";
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get suiteId(): string {
    return this.props.suiteId;
  }
  get suiteVersion(): number {
    return this.props.suiteVersion;
  }
  get status(): BenchmarkRunStatus {
    return this.props.status;
  }
  get repetitions(): number {
    return this.props.repetitions;
  }
  get concurrencyLimit(): number {
    return this.props.concurrencyLimit;
  }
  get estimatedCostAmount(): string {
    return this.props.estimatedCostAmount;
  }
  get estimatedCostCurrency(): string {
    return this.props.estimatedCostCurrency;
  }
  get costCeilingAmount(): string | undefined {
    return this.props.costCeilingAmount;
  }
  get launchedByUserId(): string {
    return this.props.launchedByUserId;
  }
  get launchedAt(): Date {
    return this.props.launchedAt;
  }
  get startedAt(): Date | undefined {
    return this.props.startedAt;
  }
  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }
  get cancelRequestedAt(): Date | undefined {
    return this.props.cancelRequestedAt;
  }
  get cancelledByUserId(): string | undefined {
    return this.props.cancelledByUserId;
  }
  get lastErrorCode(): string | undefined {
    return this.props.lastErrorCode;
  }
  get staleRecoveryAttempts(): number {
    return this.props.staleRecoveryAttempts;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
