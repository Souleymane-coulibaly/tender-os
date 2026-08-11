import { EmailAlertStatus, EMAIL_ALERT_MAX_ATTEMPTS, SavedSearchMatchStatus } from "./enums";
import type { MatchReason } from "./services/matching-engine";

export type SavedSearchMatchProps = {
  id: string;
  organizationId: string;
  savedSearchId: string;
  externalTenderId: string;
  score: number;
  matchReasons: MatchReason[];
  status: string;
  firstMatchedAt: Date;
  lastMatchedAt: Date;
  notifiedInAppAt?: Date | undefined;
  emailStatus: string;
  emailAttemptCount: number;
  emailLastError?: string | undefined;
  notifiedEmailAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/** Mission §49 — occurrence de correspondance. Idempotente par construction côté repository
 *  (`@@unique([savedSearchId, externalTenderId])`, mission §48). */
export class SavedSearchMatch {
  private constructor(private props: SavedSearchMatchProps) {}

  static create(input: { id: string; organizationId: string; savedSearchId: string; externalTenderId: string; score: number; matchReasons: MatchReason[]; occurredAt: Date }): SavedSearchMatch {
    return new SavedSearchMatch({
      id: input.id,
      organizationId: input.organizationId,
      savedSearchId: input.savedSearchId,
      externalTenderId: input.externalTenderId,
      score: input.score,
      matchReasons: input.matchReasons,
      status: SavedSearchMatchStatus.New,
      firstMatchedAt: input.occurredAt,
      lastMatchedAt: input.occurredAt,
      emailStatus: EmailAlertStatus.Pending,
      emailAttemptCount: 0,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: SavedSearchMatchProps): SavedSearchMatch {
    return new SavedSearchMatch(props);
  }

  /** Mission §12/§50 — le marché est de nouveau vu lors d'une collecte ultérieure, avec un score
   *  potentiellement différent (critères inchangés, mais le marché a été mis à jour). Jamais un
   *  nouveau statut NEW si l'utilisateur avait déjà marqué INTERESTED/IGNORED (mission §52 "un
   *  marché ignoré ne doit pas revenir constamment"). */
  refreshFromRematch(input: { score: number; matchReasons: MatchReason[]; occurredAt: Date }): void {
    this.props.score = input.score;
    this.props.matchReasons = input.matchReasons;
    this.props.lastMatchedAt = input.occurredAt;
    this.props.updatedAt = input.occurredAt;
  }

  markNotifiedInApp(occurredAt: Date): void {
    this.props.notifiedInAppAt = occurredAt;
  }

  /** Correctif audit P1-001 — transition transitoire posée par le claim atomique
   *  (`SavedSearchMatchRepository.claimPendingEmailBatch`), jamais appelée directement par un use
   *  case : garantit qu'un seul appelant à la fois peut faire progresser ce match vers SENT/FAILED. */
  claimForSending(occurredAt: Date): void {
    this.props.emailStatus = EmailAlertStatus.Sending;
    this.props.updatedAt = occurredAt;
  }

  /** Correctif audit P1-001 — le CLAIM ignore délibérément `SavedSearch.alertEmail`/`isActive`/la
   *  fenêtre du digest (il ne connaît que `emailStatus`) : l'appelant doit donc explicitement
   *  relâcher un match claimé qu'il décide finalement de ne pas envoyer (préférence désactivée,
   *  digest pas encore dû, marché introuvable), sous peine de le laisser bloqué en `SENDING` pour
   *  toujours. Retour à PENDING, jamais un compteur de tentative incrémenté : ce n'est pas un échec. */
  releaseSendingClaim(occurredAt: Date): void {
    this.props.emailStatus = EmailAlertStatus.Pending;
    this.props.updatedAt = occurredAt;
  }

  markEmailSent(occurredAt: Date): void {
    this.props.emailStatus = EmailAlertStatus.Sent;
    this.props.notifiedEmailAt = occurredAt;
    this.props.emailLastError = undefined;
    this.props.updatedAt = occurredAt;
  }

  /** Mission §67/§136 — jamais un retry indéfini : bascule FAILED après `EMAIL_ALERT_MAX_ATTEMPTS`,
   *  laisse PENDING sinon (reprise naturelle au prochain tick du worker). */
  recordEmailFailure(input: { error: string; occurredAt: Date }): void {
    this.props.emailAttemptCount += 1;
    this.props.emailLastError = input.error.slice(0, 500);
    this.props.emailStatus = this.props.emailAttemptCount >= EMAIL_ALERT_MAX_ATTEMPTS ? EmailAlertStatus.Failed : EmailAlertStatus.Pending;
    this.props.updatedAt = input.occurredAt;
  }

  setStatus(status: string, occurredAt: Date): void {
    this.props.status = status;
    this.props.updatedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get savedSearchId(): string {
    return this.props.savedSearchId;
  }
  get externalTenderId(): string {
    return this.props.externalTenderId;
  }
  get score(): number {
    return this.props.score;
  }
  get matchReasons(): readonly MatchReason[] {
    return this.props.matchReasons;
  }
  get status(): string {
    return this.props.status;
  }
  get firstMatchedAt(): Date {
    return this.props.firstMatchedAt;
  }
  get lastMatchedAt(): Date {
    return this.props.lastMatchedAt;
  }
  get notifiedInAppAt(): Date | undefined {
    return this.props.notifiedInAppAt;
  }
  get emailStatus(): string {
    return this.props.emailStatus;
  }
  get emailAttemptCount(): number {
    return this.props.emailAttemptCount;
  }
  get emailLastError(): string | undefined {
    return this.props.emailLastError;
  }
  get notifiedEmailAt(): Date | undefined {
    return this.props.notifiedEmailAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
