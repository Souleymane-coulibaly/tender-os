import { Inject, Injectable, Logger } from "@nestjs/common";
import { EMAIL_PROVIDER, type EmailProvider } from "../../../../shared-kernel/email-provider";
import { isEmailStrictEnvironment } from "../../../../shared-kernel/email-config";
import { demoRequestEmailTotal } from "../../../../shared-kernel/metrics/metrics";

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

/** Repli LOCAL/TEST UNIQUEMENT (mission §4 "un fallback raisonnable peut rester autorisé
 *  uniquement si clairement documenté") — jamais atteint en staging/production : le constructeur
 *  refuse de s'instancier dans ces environnements si `DEMO_REQUEST_NOTIFY_EMAIL` est absente
 *  (P2 audit Codex, Resend/Demo Request — voir garde ci-dessous). */
const LOCAL_FALLBACK_NOTIFY_EMAIL = "contact@tenderos.fr";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/**
 * V2 Sprint 23 (landing) — mission §27 "Ne pas construire un CRM" : aucune persistance, un simple
 * email au destinataire configuré via `EMAIL_PROVIDER` (Shared Kernel, V2 Sprint 24 — voir
 * shared-kernel/email-provider.ts —, jamais un second pipeline email). Le honeypot rempli fait un
 * no-op silencieux — jamais un email envoyé, jamais une erreur qui renseignerait le bot.
 *
 * P2 (audit Codex, Resend/Demo Request) — la destination d'un lead commercial est une décision de
 * configuration explicite, jamais un défaut deviné en staging/production (mission §3/§14) : le
 * constructeur (résolu une seule fois par Nest, au moment du démarrage) refuse de s'instancier si
 * `DEMO_REQUEST_NOTIFY_EMAIL` est absente hors local/test — ce qui fait échouer le boot de
 * l'application avant qu'un seul lead ne puisse être perdu, plutôt qu'un avertissement ignorable au
 * moment de la première soumission réelle.
 */
@Injectable()
export class SubmitDemoRequestUseCase {
  private readonly logger = new Logger(SubmitDemoRequestUseCase.name);

  constructor(@Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider) {
    if (isEmailStrictEnvironment() && !process.env.DEMO_REQUEST_NOTIFY_EMAIL) {
      throw new Error(
        "DEMO_REQUEST_NOTIFY_EMAIL must be explicitly configured when NODE_ENV is not development/test — " +
          "refusing to silently fall back to a placeholder address (P2 audit Codex, Resend/Demo Request).",
      );
    }
  }

  async execute(command: SubmitDemoRequestCommand): Promise<void> {
    if (command.honeypot) {
      return;
    }

    // La garde du constructeur ci-dessus rend ce repli inatteignable hors local/test — jamais
    // caché derrière `?? FALLBACK`, la lecture reste fraîche à chaque appel (jamais mise en cache),
    // même discipline que `ResendEmailProvider.send()`.
    const notifyEmail = process.env.DEMO_REQUEST_NOTIFY_EMAIL;
    if (!notifyEmail) {
      this.logger.warn("DEMO_REQUEST_NOTIFY_EMAIL is not configured — falling back to a placeholder address (local/test only). Set it before going live.");
    }

    const to = notifyEmail ?? LOCAL_FALLBACK_NOTIFY_EMAIL;
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

    try {
      await this.emailProvider.send({ to, subject: `Demande de démo — ${command.company}`, html, text });
      demoRequestEmailTotal.inc({ outcome: "sent" });
    } catch (error) {
      demoRequestEmailTotal.inc({ outcome: "failed" });
      // P2 (audit Codex, Resend/Demo Request) — mission §20 : catégorie d'erreur uniquement,
      // jamais le contenu du message ni un secret (ex. la clé Resend n'apparaît jamais ici, elle
      // n'est même pas connue de ce use case). Le `GlobalExceptionFilter` s'occupe déjà de ne
      // jamais exposer ce détail au visiteur (mission §15) — ce log est réservé au diagnostic
      // serveur.
      this.logger.error(`Demo request notification email failed to send: ${error instanceof Error ? error.constructor.name : "unknown error"}`);
      throw error;
    }
  }
}
