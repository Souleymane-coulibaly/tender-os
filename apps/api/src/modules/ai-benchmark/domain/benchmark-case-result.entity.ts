export type BenchmarkCaseResultProps = {
  id: string;
  runId: string;
  caseId: string;
  aiModelId: string;
  pricingSnapshotId?: string | undefined;
  repetitionIndex: number;
  provider?: string | undefined;
  model?: string | undefined;
  rawOutput?: string | undefined;
  inputTokenCount?: number | undefined;
  outputTokenCount?: number | undefined;
  totalTokenCount?: number | undefined;
  durationMs?: number | undefined;
  actualCostAmount?: string | undefined;
  evaluationPassed: boolean;
  evaluationScore: number;
  evaluationDetails: Record<string, unknown>;
  eliminationSignal?: { criticalHallucination: boolean; invalidProvenance: boolean } | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  createdAt: Date;
};

/** Résultat d'UNE tentative (cas × modèle × répétition), append-only (Sprint 5.2 §"Répétitions" —
 *  "conserver chaque résultat séparément"). Jamais mutée après création — une ré-exécution crée une
 *  nouvelle ligne avec un `repetitionIndex` différent, jamais une mise à jour en place. La taille de
 *  `rawOutput` est bornée en amont (application) avant persistance — jamais un blob non borné. */
export class BenchmarkCaseResult {
  private constructor(private props: BenchmarkCaseResultProps) {}

  static create(input: BenchmarkCaseResultProps): BenchmarkCaseResult {
    return new BenchmarkCaseResult(input);
  }

  static rehydrate(props: BenchmarkCaseResultProps): BenchmarkCaseResult {
    return new BenchmarkCaseResult(props);
  }

  get id(): string {
    return this.props.id;
  }
  get runId(): string {
    return this.props.runId;
  }
  get caseId(): string {
    return this.props.caseId;
  }
  get aiModelId(): string {
    return this.props.aiModelId;
  }
  get pricingSnapshotId(): string | undefined {
    return this.props.pricingSnapshotId;
  }
  get repetitionIndex(): number {
    return this.props.repetitionIndex;
  }
  get provider(): string | undefined {
    return this.props.provider;
  }
  get model(): string | undefined {
    return this.props.model;
  }
  get rawOutput(): string | undefined {
    return this.props.rawOutput;
  }
  get inputTokenCount(): number | undefined {
    return this.props.inputTokenCount;
  }
  get outputTokenCount(): number | undefined {
    return this.props.outputTokenCount;
  }
  get totalTokenCount(): number | undefined {
    return this.props.totalTokenCount;
  }
  get durationMs(): number | undefined {
    return this.props.durationMs;
  }
  get actualCostAmount(): string | undefined {
    return this.props.actualCostAmount;
  }
  get evaluationPassed(): boolean {
    return this.props.evaluationPassed;
  }
  get evaluationScore(): number {
    return this.props.evaluationScore;
  }
  get evaluationDetails(): Record<string, unknown> {
    return this.props.evaluationDetails;
  }
  get eliminationSignal(): { criticalHallucination: boolean; invalidProvenance: boolean } | undefined {
    return this.props.eliminationSignal;
  }
  get errorCode(): string | undefined {
    return this.props.errorCode;
  }
  get errorMessage(): string | undefined {
    return this.props.errorMessage;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
