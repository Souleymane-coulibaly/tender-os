import { Inject, Injectable, Logger } from "@nestjs/common";
import { GetCurrentUserUseCase } from "../../../identity";
import { EMAIL_PROVIDER, type EmailProvider } from "../../application/ports/email-provider";
import { CreateNotificationUseCase } from "../../application/use-cases/create-notification.use-case";

export type NotifyUserInput = Readonly<{
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | undefined;
  targetUrl?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  emailSubject: string;
  emailHtml: string;
  emailText: string;
}>;

/**
 * V2 Sprint 18 (mission §15/§21/§50/§51) — point d'entrée UNIQUE utilisé par les 6 handlers Outbox
 * de ce fichier (mention/assignation/demande/décision de validation) pour créer une notification
 * in-app PUIS tenter l'email, réutilisant STRICTEMENT l'infrastructure Sprint 17 (`Notification`,
 * `EmailProvider` — relocalisé depuis `market-watch` au Sprint 18 précisément pour ce besoin,
 * jamais un second pipeline email, mission §51/§100).
 *
 * Mission §52 "email down : la transaction continue" — la notification in-app est déjà persistée
 * (dans SA PROPRE transaction, via `CreateNotificationUseCase`) avant toute tentative d'email :
 * un échec d'envoi est journalisé, jamais propagé, jamais un rollback de la notification in-app.
 * Contrairement au digest `SavedSearchMatch` (Sprint 17, un email par lot, claim asynchrone), ces
 * événements sont ponctuels et peu fréquents (une mention, une assignation, une décision) : l'email
 * est envoyé immédiatement, en synchrone best-effort, jamais via un second worker/claim (mission
 * §99 "pas de nouveau cron parallèle").
 */
@Injectable()
export class WorkspaceEventNotificationService {
  private readonly logger = new Logger(WorkspaceEventNotificationService.name);

  constructor(
    private readonly createNotificationUseCase: CreateNotificationUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  async notifyUser(input: NotifyUserInput): Promise<void> {
    await this.createNotificationUseCase.execute({
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      targetUrl: input.targetUrl,
      metadata: input.metadata,
    });

    try {
      const user = await this.getCurrentUserUseCase.execute({ userId: input.userId });
      await this.emailProvider.send({ to: user.email, subject: input.emailSubject, html: input.emailHtml, text: input.emailText });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Email delivery failed for notification type=${input.type} userId=${input.userId}: ${message}`);
    }
  }
}
