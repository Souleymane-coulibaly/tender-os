/** Mission §87 — pas de contenu sensible dans l'email : jamais le corps d'un commentaire, jamais un
 *  payload IA, uniquement des libellés gouvernés (type d'entité) et des identifiants. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  TASK: "une tâche",
  CHECKLIST_ITEM: "un élément de checklist",
  TECHNICAL_MEMO_SECTION_REVISION: "une section de mémoire technique",
  PRICING_SCHEDULE_VERSION: "un chiffrage",
  RESPONSE_PACKAGE_VERSION: "un dossier de réponse",
};

export function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? "un élément";
}

export type SimpleEmail = Readonly<{ subject: string; html: string; text: string }>;

/** Mission §46/§100 — même motif que `email-alert-templates.ts` (market-watch, Sprint 17) : lien
 *  TenderOS uniquement, jamais un contenu métier complet embarqué dans l'email. */
function wrap(subject: string, bodyText: string, link: string): SimpleEmail {
  return {
    subject,
    html: `<p>${escapeHtml(bodyText)}</p><p><a href="${escapeHtml(link)}">Ouvrir TenderOS</a></p>`,
    text: `${bodyText}\n\n${link}`,
  };
}

export function buildMentionEmail(link: string): SimpleEmail {
  return wrap("Vous avez été mentionné sur TenderOS", "Vous avez été mentionné dans un commentaire sur TenderOS.", link);
}

export function buildTaskAssignedEmail(link: string): SimpleEmail {
  return wrap("Une tâche vous a été assignée", "Une tâche vous a été assignée sur TenderOS.", link);
}

export function buildApprovalRequestedEmail(entityType: string, link: string): SimpleEmail {
  return wrap("Une validation vous est demandée", `Une validation vous est demandée sur ${entityTypeLabel(entityType)}.`, link);
}

export function buildApprovalDecisionEmail(outcome: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED", entityType: string, link: string): SimpleEmail {
  const label = entityTypeLabel(entityType);
  const text =
    outcome === "APPROVED"
      ? `Votre demande de validation sur ${label} a été approuvée.`
      : outcome === "REJECTED"
        ? `Votre demande de validation sur ${label} a été rejetée.`
        : `Des modifications sont demandées sur votre demande de validation (${label}).`;
  const subject = outcome === "APPROVED" ? "Votre demande a été approuvée" : outcome === "REJECTED" ? "Votre demande a été rejetée" : "Modifications demandées";
  return wrap(subject, text, link);
}
