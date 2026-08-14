import { escapeHtml, type SimpleEmail } from "./workspace-notification-templates";

/** Même motif que `workspace-notification-templates.ts` (mission §46/§100) : lien TenderOS
 *  uniquement, jamais de contenu financier détaillé (montant, moyen de paiement) dans l'email. */
function wrap(subject: string, bodyText: string, link: string): SimpleEmail {
  return {
    subject,
    html: `<p>${escapeHtml(bodyText)}</p><p><a href="${escapeHtml(link)}">Ouvrir TenderOS</a></p>`,
    text: `${bodyText}\n\n${link}`,
  };
}

export function buildLowAoCreditBalanceEmail(balance: number, link: string): SimpleEmail {
  const text = balance === 0 ? "Votre organisation n'a plus aucun crédit AO disponible." : `Votre organisation n'a plus que ${balance} crédit(s) AO disponible(s).`;
  return wrap(balance === 0 ? "Plus aucun crédit AO disponible" : `${balance} crédit(s) AO restant(s)`, text, link);
}

export function buildPassPurchaseConfirmedEmail(link: string): SimpleEmail {
  return wrap("Votre Pass AO est disponible", "Votre achat de Pass AO est confirmé. Votre Pass AO est disponible.", link);
}

export function buildPassConsumedForTenderEmail(link: string): SimpleEmail {
  return wrap("Votre Pass AO est associé à un dossier", "Votre Pass AO est maintenant associé à ce dossier d'appel d'offres.", link);
}

export function buildSubscriptionPaymentFailedEmail(link: string): SimpleEmail {
  return wrap("Échec de paiement sur votre abonnement", "Le paiement de votre abonnement TenderOS a échoué. Merci de mettre à jour votre moyen de paiement.", link);
}

export function buildSubscriptionPlanChangedEmail(fromPlanTier: string, toPlanTier: string, link: string): SimpleEmail {
  return wrap("Votre abonnement a changé", `Votre abonnement TenderOS est passé de ${fromPlanTier} à ${toPlanTier}.`, link);
}

export function buildSubscriptionCanceledEmail(link: string): SimpleEmail {
  return wrap("Votre abonnement a été résilié", "Votre abonnement TenderOS a été résilié.", link);
}

const QUOTA_LABELS: Record<string, string> = {
  USERS_MAX: "d'utilisateurs",
  CHAT_AI_DAILY_MAX: "de messages Chat IA (aujourd'hui)",
  STORAGE_GB_MAX: "de stockage",
};

/** Correctif audit Codex 22E (P1-02) — mission "alertes de seuil 80%/100%", jamais le contenu
 *  métier détaillé au-delà du libellé du quota (mission §87, même motif que les autres templates). */
export function buildQuotaThresholdReachedEmail(quotaType: string, threshold: number, link: string): SimpleEmail {
  const label = QUOTA_LABELS[quotaType] ?? "d'usage";
  const text = threshold >= 100 ? `Votre organisation a atteint son quota ${label}.` : `Votre organisation a atteint ${threshold}% de son quota ${label}.`;
  const subject = threshold >= 100 ? "Quota atteint" : `${threshold}% du quota atteint`;
  return wrap(subject, text, link);
}
