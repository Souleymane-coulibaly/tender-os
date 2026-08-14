import { Inject, Injectable, Logger } from "@nestjs/common";
import { EMAIL_PROVIDER, type EmailProvider } from "../../../notifications";

export type SubmitDemoRequestCommand = Readonly<{
  name: string;
  email: string;
  company: string;
  phone?: string | undefined;
  message?: string | undefined;
  /** Champ honeypot (mission §27 "protection anti-spam raisonnable") — jamais affiché à un humain
   *  (masqué CSS côté formulaire), un bot générique le remplit presque toujours. Rempli => la
   *  requête est silencieusement ignorée (jamais d'erreur qui renseignerait un bot sur le piège). */
  honeypot?: string | undefined;
}>;

/** Config externe requise (mission §34) — pas de défaut trompeur : si absente, on log un
 *  avertissement clair plutôt que d'échouer silencieusement ou d'inventer une adresse réelle. */
const FALLBACK_NOTIFY_EMAIL = "contact@tenderos.fr";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/**
 * V2 Sprint 23 (landing) — mission §27 "Ne pas construire un CRM" : aucune persistance, un simple
 * email au destinataire configuré via `EMAIL_PROVIDER` (déjà exporté par `NotificationsModule`,
 * jamais un second pipeline email). Le honeypot rempli fait un no-op silencieux — jamais un email
 * envoyé, jamais une erreur qui renseignerait le bot.
 */
@Injectable()
export class SubmitDemoRequestUseCase {
  private readonly logger = new Logger(SubmitDemoRequestUseCase.name);

  constructor(@Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider) {}

  async execute(command: SubmitDemoRequestCommand): Promise<void> {
    if (command.honeypot) {
      return;
    }

    const notifyEmail = process.env.DEMO_REQUEST_NOTIFY_EMAIL;
    if (!notifyEmail) {
      this.logger.warn("DEMO_REQUEST_NOTIFY_EMAIL is not configured — falling back to a placeholder address. Set it before going live.");
    }

    const to = notifyEmail ?? FALLBACK_NOTIFY_EMAIL;
    const safe = {
      name: escapeHtml(command.name),
      email: escapeHtml(command.email),
      company: escapeHtml(command.company),
      phone: command.phone ? escapeHtml(command.phone) : null,
      message: command.message ? escapeHtml(command.message) : null,
    };

    const html = `
      <h2>Nouvelle demande de démo TenderOS</h2>
      <p><strong>Nom :</strong> ${safe.name}</p>
      <p><strong>Email :</strong> ${safe.email}</p>
      <p><strong>Entreprise :</strong> ${safe.company}</p>
      ${safe.phone ? `<p><strong>Téléphone :</strong> ${safe.phone}</p>` : ""}
      ${safe.message ? `<p><strong>Message :</strong><br />${safe.message}</p>` : ""}
    `.trim();

    const text = [
      "Nouvelle demande de démo TenderOS",
      `Nom : ${command.name}`,
      `Email : ${command.email}`,
      `Entreprise : ${command.company}`,
      command.phone ? `Téléphone : ${command.phone}` : null,
      command.message ? `Message : ${command.message}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    await this.emailProvider.send({ to, subject: `Demande de démo — ${command.company}`, html, text });
  }
}
