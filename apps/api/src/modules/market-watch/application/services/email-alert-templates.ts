import type { EmailMessage } from "../../../notifications";

/** Mission §77/§78/§79 — le titre/l'acheteur d'un marché externe est un CONTENU NON FIABLE
 *  (provenant d'une source tierce, jamais assaini à la collecte). Échappement HTML minimal mais
 *  complet des 5 caractères significatifs, jamais un rendu HTML brut de contenu externe. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export type EmailAlertItem = Readonly<{ tenderId: string; tenderTitle: string; buyerName?: string | undefined; deadline?: Date | undefined; score: number; matchReasonLabels: readonly string[] }>;

function formatDeadline(deadline: Date | undefined): string {
  if (!deadline) return "Non communiquée";
  return deadline.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function itemHtml(item: EmailAlertItem, baseUrl: string): string {
  const url = `${baseUrl}/app/market-watch/${item.tenderId}`;
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;">
        <a href="${escapeHtml(url)}" style="font-size:15px;font-weight:600;color:#111827;text-decoration:none;">${escapeHtml(item.tenderTitle)}</a>
        <div style="font-size:13px;color:#6b7280;margin-top:4px;">
          ${item.buyerName ? `${escapeHtml(item.buyerName)} · ` : ""}Deadline : ${formatDeadline(item.deadline)} · Pertinence ${item.score}%
        </div>
        ${item.matchReasonLabels.length > 0 ? `<div style="font-size:12px;color:#9ca3af;margin-top:2px;">${item.matchReasonLabels.map((label) => escapeHtml(label)).join(" · ")}</div>` : ""}
      </td>
    </tr>`;
}

function itemText(item: EmailAlertItem, baseUrl: string): string {
  const url = `${baseUrl}/app/market-watch/${item.tenderId}`;
  return `- ${item.tenderTitle}${item.buyerName ? ` (${item.buyerName})` : ""} — deadline ${formatDeadline(item.deadline)} — pertinence ${item.score}% — ${url}`;
}

/** Mission §35/§43/§107 — un seul marché, envoyé sans délai (fréquence IMMEDIATE). */
export function buildImmediateMatchEmail(input: { savedSearchName: string; item: EmailAlertItem; baseUrl: string }): EmailMessage {
  const subject = `TenderOS — Nouveau marché pour votre veille "${input.savedSearchName}"`;
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f9fafb;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">
      <h1 style="font-size:18px;color:#111827;margin:0 0 16px;">1 nouveau marché correspond à votre veille "${escapeHtml(input.savedSearchName)}"</h1>
      <table style="width:100%;border-collapse:collapse;">${itemHtml(input.item, input.baseUrl)}</table>
      <p style="margin-top:24px;font-size:13px;color:#6b7280;">Vous recevez cet e-mail car les alertes immédiates sont activées pour cette veille. Vous pouvez les désactiver depuis TenderOS.</p>
    </div>
  </body></html>`;
  const text = `1 nouveau marché correspond à votre veille "${input.savedSearchName}"\n\n${itemText(input.item, input.baseUrl)}\n\nVous pouvez désactiver ces alertes depuis TenderOS.`;
  return { to: "", subject, html, text };
}

/** Mission §43/§45/§111 — plusieurs correspondances regroupées en un seul e-mail (fréquence
 *  DAILY_DIGEST), jamais un e-mail par marché. */
export function buildDailyDigestEmail(input: { savedSearchName: string; items: readonly EmailAlertItem[]; baseUrl: string }): EmailMessage {
  const subject = `TenderOS — ${input.items.length} nouveau${input.items.length > 1 ? "x" : ""} marché${input.items.length > 1 ? "s" : ""} pour votre veille "${input.savedSearchName}"`;
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f9fafb;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">
      <h1 style="font-size:18px;color:#111827;margin:0 0 16px;">${input.items.length} nouveau${input.items.length > 1 ? "x" : ""} marché${input.items.length > 1 ? "s" : ""} pour votre veille "${escapeHtml(input.savedSearchName)}"</h1>
      <table style="width:100%;border-collapse:collapse;">${input.items.map((item) => itemHtml(item, input.baseUrl)).join("")}</table>
      <p style="margin-top:24px;font-size:13px;color:#6b7280;">Résumé quotidien — vous pouvez passer en alertes immédiates ou désactiver les e-mails depuis TenderOS.</p>
    </div>
  </body></html>`;
  const text = `${input.items.length} nouveaux marchés pour votre veille "${input.savedSearchName}"\n\n${input.items.map((item) => itemText(item, input.baseUrl)).join("\n")}\n\nVous pouvez gérer ces alertes depuis TenderOS.`;
  return { to: "", subject, html, text };
}
