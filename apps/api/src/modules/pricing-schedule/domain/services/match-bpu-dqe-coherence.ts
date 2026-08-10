import { Decimal } from "@prisma/client/runtime/library";
import { PricingScheduleLineKind } from "../enums";
import type { PricingScheduleLine } from "../pricing-schedule-line.entity";

export type BpuDqeCoherenceFinding = Readonly<{
  matchingKey: string;
  sheetName: string;
  primaryLineId: string;
  primaryUnitPrice: string;
  comparedScheduleId: string;
  comparedLineId: string;
  comparedUnitPrice: string;
}>;

/**
 * Rapprochement BPU↔DQE (mission §38) — quand deux lignes de deux chiffrages DIFFÉRENTS (un BPU,
 * un DQE) référencent le même poste (même `matchingKey` normalisé + même feuille), leurs prix
 * unitaires DEVRAIENT correspondre : un écart est signalé, JAMAIS silencieusement réconcilié ni
 * fusionné. Le rapprochement lui-même reste EXPLICITE : `matchingKey` est une clé normalisée déjà
 * calculée à l'extraction (désignation), jamais une fusion "au petit bonheur" sur simple similarité
 * texte — un `matchingKey` absent ou non partagé ne produit JAMAIS de correspondance devinée.
 */
export function matchBpuDqeCoherence(input: {
  primaryLines: readonly PricingScheduleLine[];
  comparedScheduleId: string;
  comparedLines: readonly PricingScheduleLine[];
}): readonly BpuDqeCoherenceFinding[] {
  const findings: BpuDqeCoherenceFinding[] = [];

  const comparedByKey = new Map<string, PricingScheduleLine[]>();
  for (const line of input.comparedLines) {
    if (line.kind !== PricingScheduleLineKind.PriceItem || !line.matchingKey || line.proposedUnitPrice === undefined) continue;
    const key = `${line.sheetName}::${line.matchingKey}`;
    const list = comparedByKey.get(key) ?? [];
    list.push(line);
    comparedByKey.set(key, list);
  }

  for (const primaryLine of input.primaryLines) {
    if (primaryLine.kind !== PricingScheduleLineKind.PriceItem || !primaryLine.matchingKey || primaryLine.proposedUnitPrice === undefined) continue;
    const key = `${primaryLine.sheetName}::${primaryLine.matchingKey}`;
    const candidates = comparedByKey.get(key);
    if (!candidates || candidates.length !== 1) continue; // Ambigu (0 ou plusieurs) → jamais un rapprochement deviné.

    const comparedLine = candidates[0]!;
    if (!new Decimal(primaryLine.proposedUnitPrice).equals(new Decimal(comparedLine.proposedUnitPrice!))) {
      findings.push({
        matchingKey: primaryLine.matchingKey,
        sheetName: primaryLine.sheetName,
        primaryLineId: primaryLine.id,
        primaryUnitPrice: primaryLine.proposedUnitPrice,
        comparedScheduleId: input.comparedScheduleId,
        comparedLineId: comparedLine.id,
        comparedUnitPrice: comparedLine.proposedUnitPrice!,
      });
    }
  }

  return findings;
}
