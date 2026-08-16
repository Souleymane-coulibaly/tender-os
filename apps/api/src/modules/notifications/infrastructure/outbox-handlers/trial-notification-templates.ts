import { escapeHtml, type SimpleEmail } from "./workspace-notification-templates";

/**
 * V2 Sprint 25 (Trial Starter) — EXCEPTION délibérée et scopée à ces trois emails, à la
 * différence de `billing-notification-templates.ts` (qui n'inclut "jamais de contenu financier
 * détaillé" par principe général) : mission §30/§31 "chaque email de fin imminente doit afficher
 * clairement : date de fin ; montant futur ; interval" et "ne pas cacher la date de facturation ;
 * ne pas cacher le montant futur" (no dark pattern). L'objet même de ces emails est d'avertir
 * d'un prélèvement à venir — omettre le montant irait à l'encontre de leur seule raison d'être,
 * contrairement aux autres notifications billing (changement de palier, échec de paiement...) qui
 * n'ont jamais besoin d'un montant pour être utiles.
 */

const BILLING_INTERVAL_LABELS: Record<string, string> = { MONTHLY: "mois", YEARLY: "an" };

function formatEuros(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} € HT`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(date);
}

function wrap(subject: string, bodyText: string, link: string): SimpleEmail {
  return {
    subject,
    html: `<p>${escapeHtml(bodyText)}</p><p><a href="${escapeHtml(link)}">Gérer mon abonnement</a></p>`,
    text: `${bodyText}\n\n${link}`,
  };
}

function billingSummary(futurePriceCents: number, billingInterval: string, trialEndsAt: Date): string {
  const intervalLabel = BILLING_INTERVAL_LABELS[billingInterval] ?? billingInterval.toLowerCase();
  return `${formatEuros(futurePriceCents)}/${intervalLabel} à partir du ${formatDate(trialEndsAt)}`;
}

export function buildTrialStartedEmail(input: { futurePriceCents: number; billingInterval: string; trialEndsAt: Date; link: string }): SimpleEmail {
  const text = `Votre essai gratuit Starter de 14 jours est activé. ${billingSummary(input.futurePriceCents, input.billingInterval, input.trialEndsAt)}, sauf résiliation avant cette date.`;
  return wrap("Votre essai Starter est activé", text, input.link);
}

/** `daysRemaining` ∈ {7, 3, 1} — mission §29, texte exact. */
export function buildTrialEndingSoonEmail(input: { daysRemaining: number; futurePriceCents: number; billingInterval: string; trialEndsAt: Date; link: string }): SimpleEmail {
  const summary = billingSummary(input.futurePriceCents, input.billingInterval, input.trialEndsAt);
  if (input.daysRemaining === 1) {
    return wrap("Votre essai se termine demain", `Votre essai Starter se termine demain. ${summary}. Vous pouvez résilier avant cette date pour ne pas être débité.`, input.link);
  }
  return wrap(
    `${input.daysRemaining} jours restants sur votre essai Starter`,
    `Il vous reste ${input.daysRemaining} jours d'essai Starter. ${summary}. Vous pouvez résilier avant cette date pour ne pas être débité.`,
    input.link,
  );
}

export function buildTrialConvertedEmail(input: { priceCents: number; billingInterval: string; link: string }): SimpleEmail {
  const intervalLabel = BILLING_INTERVAL_LABELS[input.billingInterval] ?? input.billingInterval.toLowerCase();
  const text = `Votre essai Starter est terminé et votre abonnement est désormais actif — ${formatEuros(input.priceCents)}/${intervalLabel}.`;
  return wrap("Votre abonnement Starter est activé", text, input.link);
}
