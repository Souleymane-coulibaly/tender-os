import { Injectable, Logger } from "@nestjs/common";
import type { EmailMessage, EmailProvider } from "./email-provider";

const RESEND_API_URL = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * V2 Sprint 18 — relocalisé depuis `market-watch` (Sprint 17), comportement inchangé : jamais de
 * clé en dur, lue depuis `process.env.RESEND_API_KEY` à chaque envoi (jamais mise en cache au
 * démarrage), `process.env.RESEND_FROM_EMAIL` pour l'expéditeur. Sans clé configurée, `send()`
 * échoue explicitement (jamais un faux succès silencieux) — c'est au module d'assemblage
 * (`SharedKernelModule`) de choisir `LoggingEmailProvider` par défaut. V2 Sprint 24 — relocalisé
 * une seconde fois de `notifications` vers `shared-kernel` (voir `email-provider.ts`).
 */
@Injectable()
export class ResendEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ResendEmailProvider.name);

  async send(message: EmailMessage): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !fromEmail) {
      throw new Error("RESEND_API_KEY/RESEND_FROM_EMAIL is not configured — cannot send via Resend.");
    }

    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      this.logger.warn(`Resend responded HTTP ${response.status}: ${body.slice(0, 300)}`);
      throw new Error(`Resend API responded HTTP ${response.status}`);
    }
  }
}
