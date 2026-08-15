/**
 * V2 Sprint 24 (onboarding, flow "Mot de passe oublié") — relocalisé depuis `notifications`
 * (où il avait lui-même été relocalisé depuis `market-watch` au Sprint 18) : `identity` a
 * désormais besoin d'envoyer un email (réinitialisation de mot de passe), mais NE PEUT PAS
 * importer `NotificationsModule` (qui importe déjà `IdentityModule` — un import inverse créerait
 * un cycle direct, interdit dans ce dépôt). `EMAIL_PROVIDER` devient donc une primitive
 * transversale du Shared Kernel (même statut que `CLOCK`/`ID_GENERATOR`), disponible partout via
 * `SharedKernelModule` (`@Global()`) sans jamais recréer de second pipeline email. Interface
 * inchangée — aucune clé Resend en dur nulle part (`ResendEmailProvider` lit `RESEND_API_KEY`
 * depuis `process.env`, jamais un défaut, jamais un fallback silencieux). Sans clé configurée,
 * `LoggingEmailProvider` fonctionne normalement (jamais un échec silencieux, jamais une exigence
 * de secret de production).
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
