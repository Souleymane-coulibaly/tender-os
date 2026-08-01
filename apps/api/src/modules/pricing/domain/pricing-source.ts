/** Nature d'une ligne de breakdown ou d'un montant (mission Sprint 7 — la distinction centrale à ne
 *  jamais fusionner : un coût réel IA n'est jamais mélangé avec une projection). */
export const PricingSource = {
  Actual: "ACTUAL",
  Estimated: "ESTIMATED",
} as const;

export type PricingSource = (typeof PricingSource)[keyof typeof PricingSource];
