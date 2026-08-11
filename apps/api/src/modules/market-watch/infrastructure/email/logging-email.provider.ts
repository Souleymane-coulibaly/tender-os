import { Injectable, Logger } from "@nestjs/common";
import type { EmailMessage, EmailProvider } from "../../application/ports/email-provider";

/** Mission §39/§41/§42 — provider par défaut tant que `RESEND_API_KEY` n'est pas configurée
 *  (phase infra différée) : journalise au lieu d'envoyer, ne bloque jamais le Sprint 17 sur un
 *  secret de production, ne fait jamais échouer silencieusement (le tick le journalise
 *  explicitement plutôt que de compter un succès fictif). */
@Injectable()
export class LoggingEmailProvider implements EmailProvider {
  private readonly logger = new Logger(LoggingEmailProvider.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.warn(`RESEND_API_KEY not configured — email NOT sent (logged only): to=${message.to} subject="${message.subject}"`);
  }
}
