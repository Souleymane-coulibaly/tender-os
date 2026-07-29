import type { DocumentExtractionStrategy } from "./document-extraction-strategy";

export type ExtractionAttemptOutcome = "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED";

export type ExtractionAttemptProps = {
  id: string;
  documentId: string;
  organizationId: string;
  attemptNumber: number;
  strategy: DocumentExtractionStrategy;
  outcome: ExtractionAttemptOutcome;
  /** Nom du moteur ayant traité cette tentative (ex. "pdf-parse", "tesseract.js", "mammoth",
   *  "xlsx") — jamais une clé/secret fournisseur (mission §9 "sécurité"). */
  provider?: string | undefined;
  providerVersion?: string | undefined;
  /** Identifiant de requête côté fournisseur, pour le support — jamais le contenu lui-même. */
  providerRequestId?: string | undefined;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  pageCount?: number | undefined;
  characterCount?: number | undefined;
  chunkCount?: number | undefined;
  language?: string | undefined;
  warnings: string[];
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
};

/**
 * Trace immuable d'une tentative d'extraction (mission §14 "persistance" — un historique, jamais
 * réécrit). `DocumentExtraction` ne porte que l'état COURANT (résumé) ; chaque tentative,
 * réussie ou non, laisse ici une ligne distincte — c'est ce qui permet d'observer un retry sans
 * perdre la trace de l'échec précédent.
 */
export class ExtractionAttempt {
  private constructor(private readonly props: ExtractionAttemptProps) {}

  static create(input: ExtractionAttemptProps): ExtractionAttempt {
    return new ExtractionAttempt(input);
  }

  static rehydrate(props: ExtractionAttemptProps): ExtractionAttempt {
    return new ExtractionAttempt(props);
  }

  get id(): string {
    return this.props.id;
  }
  get documentId(): string {
    return this.props.documentId;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get attemptNumber(): number {
    return this.props.attemptNumber;
  }
  get strategy(): DocumentExtractionStrategy {
    return this.props.strategy;
  }
  get outcome(): ExtractionAttemptOutcome {
    return this.props.outcome;
  }
  get provider(): string | undefined {
    return this.props.provider;
  }
  get providerVersion(): string | undefined {
    return this.props.providerVersion;
  }
  get providerRequestId(): string | undefined {
    return this.props.providerRequestId;
  }
  get startedAt(): Date {
    return this.props.startedAt;
  }
  get finishedAt(): Date {
    return this.props.finishedAt;
  }
  get durationMs(): number {
    return this.props.durationMs;
  }
  get pageCount(): number | undefined {
    return this.props.pageCount;
  }
  get characterCount(): number | undefined {
    return this.props.characterCount;
  }
  get chunkCount(): number | undefined {
    return this.props.chunkCount;
  }
  get language(): string | undefined {
    return this.props.language;
  }
  get warnings(): string[] {
    return this.props.warnings;
  }
  get errorCode(): string | undefined {
    return this.props.errorCode;
  }
  get errorMessage(): string | undefined {
    return this.props.errorMessage;
  }
}
