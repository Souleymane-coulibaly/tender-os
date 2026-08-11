/**
 * Mission §39/§40 — abstraction EmailProvider. Aucune clé Resend en dur nulle part (mission §39
 * "ne jamais hardcoder une clé") : `ResendEmailProvider` lit `RESEND_API_KEY` depuis
 * `process.env`, jamais un défaut, jamais un fallback silencieux. Sans clé configurée,
 * `FakeEmailProvider`/tests fonctionnent normalement (mission §41).
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
