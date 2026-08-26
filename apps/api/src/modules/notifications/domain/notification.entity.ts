/**
 * Checkpoint TENDEROS-2.1-PRE-DECOM-FIX (REC-002) — CONTRAT DE TITRE.
 *
 * `Notification.title` est un RESUME D'INTERFACE (`"Nouveau marche : <titre>"`), jamais la source de
 * verite du libelle : celle-ci reste `ExternalTender.title`, assez large pour les avis TED reels
 * (375 caracteres observes en base, contre 200 au maximum cote BOAMP). La colonne
 * `notifications.title` est un `VarChar(300)` DELIBERE, dimensionne pour un resume.
 *
 * LE DEFAUT CORRIGE — aucune normalisation n'existait avant persistance : un titre TED long faisait
 * echouer `notification.create()` ("value too long for the column"), ce qui condamnait la TOTALITE
 * du cycle Market Watch TED et renvoyait un 500 brut sur "Tester la veille", alors meme que BOAMP
 * avait reussi. Elargir la colonne aurait deplace le probleme au premier titre plus long encore.
 *
 * La troncature est DETERMINISTE (meme entree, meme sortie) et conserve le debut du libelle, qui
 * porte l'information utile. L'utilisateur retrouve toujours le titre integral en ouvrant
 * l'opportunite liee (`targetUrl`).
 */
export const NOTIFICATION_TITLE_MAX_LENGTH = 300;
const TITLE_ELLIPSIS = "…";

export function truncateNotificationTitle(title: string): string {
  if (title.length <= NOTIFICATION_TITLE_MAX_LENGTH) return title;
  return title.slice(0, NOTIFICATION_TITLE_MAX_LENGTH - TITLE_ELLIPSIS.length).trimEnd() + TITLE_ELLIPSIS;
}

export type NotificationProps = {
  id: string;
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | undefined;
  targetUrl?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  readAt?: Date | undefined;
  createdAt: Date;
};

/** Mission §37 — socle minimal, générique (`type` gouverne le producteur), un seul producteur ce
 *  sprint (`market-watch`, SavedSearchMatch). Jamais un système de notification "énorme" : pas de
 *  canal/priorité/expiration, juste lu/non-lu (mission §38). */
export class Notification {
  private constructor(private props: NotificationProps) {}

  static create(input: Omit<NotificationProps, "readAt" | "createdAt"> & { occurredAt: Date }): Notification {
    // Checkpoint TENDEROS-2.1-PRE-DECOM-FIX (REC-002) — normalisation appliquee ICI, dans la
    // fabrique du domaine, jamais chez l'appelant : tout producteur present ou futur est protege.
    input = { ...input, title: truncateNotificationTitle(input.title) };
    return new Notification({ ...input, createdAt: input.occurredAt });
  }

  static rehydrate(props: NotificationProps): Notification {
    return new Notification(props);
  }

  markRead(occurredAt: Date): void {
    this.props.readAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get userId(): string {
    return this.props.userId;
  }
  get type(): string {
    return this.props.type;
  }
  get title(): string {
    return this.props.title;
  }
  get body(): string | undefined {
    return this.props.body;
  }
  get targetUrl(): string | undefined {
    return this.props.targetUrl;
  }
  get metadata(): Record<string, unknown> | undefined {
    return this.props.metadata;
  }
  get readAt(): Date | undefined {
    return this.props.readAt;
  }
  get isRead(): boolean {
    return this.props.readAt !== undefined;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
