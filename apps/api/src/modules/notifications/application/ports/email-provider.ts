/**
 * V2 Sprint 18 — relocalisé depuis `market-watch` (Sprint 17) : l'abstraction email est un souci
 * transverse (notifications), jamais propre à la veille de marché. Interface inchangée — aucune
 * clé Resend en dur nulle part (`ResendEmailProvider` lit `RESEND_API_KEY` depuis `process.env`,
 * jamais un défaut, jamais un fallback silencieux). Sans clé configurée, `LoggingEmailProvider`
 * fonctionne normalement (jamais un échec silencieux, jamais une exigence de secret de production).
 */
export type EmailMessage = Readonly<{
  to: string;
  subject: string;
  html: string;
  text: string;
}>;

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");
