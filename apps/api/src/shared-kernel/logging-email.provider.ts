import { Injectable, Logger } from "@nestjs/common";
import type { EmailMessage, EmailProvider } from "./email-provider";

/** V2 Sprint 18 — relocalisé depuis `market-watch` (Sprint 17), comportement inchangé : provider
 *  par défaut tant que `RESEND_API_KEY` n'est pas configurée — journalise au lieu d'envoyer, ne
 *  bloque jamais le Sprint sur un secret de production, ne fait jamais échouer silencieusement.
 *  V2 Sprint 24 — relocalisé une seconde fois de `notifications` vers `shared-kernel` (voir
 *  `email-provider.ts`). */
@Injectable()
export class LoggingEmailProvider implements EmailProvider {
  private readonly logger = new Logger(LoggingEmailProvider.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.warn(`RESEND_API_KEY not configured — email NOT sent (logged only): to=${message.to} subject="${message.subject}"`);
  }
}
