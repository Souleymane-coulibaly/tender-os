import type { RenderableBlock } from "../../../../export";

/** Sprint 8C Phase 3 — un champ optionnel absent n'est jamais un blocage de génération (mission
 *  "jamais un blocage inventé") : rendu comme "(non renseigné)", jamais une valeur omise en
 *  silence qui laisserait croire que le champ n'existe pas dans le formulaire. */
export function fieldParagraph(label: string, value: string | number | undefined | null): RenderableBlock {
  return { kind: "paragraph", text: `${label} : ${value === undefined || value === null || value === "" ? "(non renseigné)" : value}` };
}

export function heading(level: 1 | 2 | 3, text: string): RenderableBlock {
  return { kind: "heading", level, text };
}

export function notice(text: string): RenderableBlock {
  return { kind: "notice", text };
}

export function formatMoney(amountValue: number, amountCurrency: string): string {
  return `${amountValue.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${amountCurrency}`;
}

export function formatDate(value: string | Date | undefined): string {
  if (!value) return "(non renseigné)";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("fr-FR");
}
