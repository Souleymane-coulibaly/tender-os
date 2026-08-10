import { Decimal } from "@prisma/client/runtime/library";
import { ControlCode, ControlSeverity, PricingScheduleLineKind } from "../enums";
import type { PricingScheduleLine } from "../pricing-schedule-line.entity";

export type PricingScheduleControlFinding = Readonly<{
  code: ControlCode;
  severity: ControlSeverity;
  pricingScheduleLineId?: string | undefined;
  message: string;
}>;

export type ComputePricingControlsResult = Readonly<{
  findings: readonly PricingScheduleControlFinding[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}>;

/** Un prix unitaire est jugé "aberrant" (mission §60 — signal explicable, JAMAIS une correction
 *  automatique ni une affirmation "ce prix est faux") s'il s'écarte de plus d'un facteur 5 de la
 *  médiane des lignes déjà chiffrées de la même version — seuil défensif volontairement large,
 *  jamais présenté comme une vérité de marché. */
const ABERRANT_PRICE_RATIO = 5;

function median(values: readonly Decimal[]): Decimal | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? sorted[mid - 1]!.plus(sorted[mid]!).dividedBy(2) : sorted[mid]!;
}

/**
 * Contrôles calculés À LA LECTURE (mission — même motif que la couverture `TechnicalMemo`, Sprint
 * 12 : jamais un statut persisté silencieusement recalculé en arrière-plan), sur les lignes d'UNE
 * `PricingScheduleVersion`. Limite honnête (mission "ne jamais prétendre supporter plus que ce qui
 * est fait") : `BROKEN_FORMULA`/`MODIFIED_SOURCE_QUANTITY`/`MODIFIED_PROTECTED_CELL` exigeraient de
 * relire le classeur source pour comparer à un instantané précédent — non implémentés ici, cette
 * fonction ne les invente jamais silencieusement. `BPU_DQE_INCOHERENCE` est calculé séparément
 * (portée MULTI-chiffrage — voir `matchBpuDqeCoherence`), jamais dans cette fonction mono-version.
 */
export function computePricingControls(lines: readonly PricingScheduleLine[]): ComputePricingControlsResult {
  const findings: PricingScheduleControlFinding[] = [];
  const priceableLines = lines.filter((line) => line.kind === PricingScheduleLineKind.PriceItem);

  for (const line of priceableLines) {
    if (!line.designation.trim()) {
      findings.push({ code: ControlCode.EmptyMandatoryCell, severity: ControlSeverity.Error, pricingScheduleLineId: line.id, message: "Désignation manquante sur une ligne de prix." });
    }
    if (line.proposedUnitPrice === undefined) {
      findings.push({ code: ControlCode.MissingUnitPrice, severity: ControlSeverity.Error, pricingScheduleLineId: line.id, message: `Prix unitaire manquant : "${line.designation}".` });
    }
    if (line.quantity !== undefined && line.proposedUnitPrice !== undefined && line.proposedTotal !== undefined) {
      const expectedTotal = new Decimal(line.quantity).times(new Decimal(line.proposedUnitPrice));
      if (!expectedTotal.equals(new Decimal(line.proposedTotal))) {
        findings.push({ code: ControlCode.IncoherentTotal, severity: ControlSeverity.Error, pricingScheduleLineId: line.id, message: `Total incohérent avec quantité × PU : "${line.designation}".` });
      }
    }
    if (line.quantity !== undefined && !line.unit) {
      findings.push({ code: ControlCode.IncoherentUnit, severity: ControlSeverity.Warning, pricingScheduleLineId: line.id, message: `Unité manquante alors qu'une quantité est renseignée : "${line.designation}".` });
    }
  }

  const matchingKeyCounts = new Map<string, number>();
  for (const line of priceableLines) {
    if (!line.matchingKey) continue;
    const key = `${line.sheetName}::${line.matchingKey}`;
    matchingKeyCounts.set(key, (matchingKeyCounts.get(key) ?? 0) + 1);
  }
  for (const line of priceableLines) {
    if (!line.matchingKey) continue;
    const key = `${line.sheetName}::${line.matchingKey}`;
    if ((matchingKeyCounts.get(key) ?? 0) > 1) {
      findings.push({ code: ControlCode.DuplicateLine, severity: ControlSeverity.Warning, pricingScheduleLineId: line.id, message: `Désignation potentiellement dupliquée dans la même feuille : "${line.designation}".` });
    }
  }

  const pricedValues = priceableLines.filter((line) => line.proposedUnitPrice !== undefined).map((line) => new Decimal(line.proposedUnitPrice!));
  const medianPrice = median(pricedValues);
  if (medianPrice && !medianPrice.isZero()) {
    for (const line of priceableLines) {
      if (line.proposedUnitPrice === undefined) continue;
      const price = new Decimal(line.proposedUnitPrice);
      const ratio = price.dividedBy(medianPrice);
      if (ratio.greaterThan(ABERRANT_PRICE_RATIO) || ratio.lessThan(new Decimal(1).dividedBy(ABERRANT_PRICE_RATIO))) {
        findings.push({
          code: ControlCode.AberrantRelativePrice,
          severity: ControlSeverity.Warning,
          pricingScheduleLineId: line.id,
          message: `Prix unitaire très éloigné de la médiane de cette version (à vérifier, jamais corrigé automatiquement) : "${line.designation}".`,
        });
      }
    }
  }

  const errorCount = findings.filter((f) => f.severity === ControlSeverity.Error).length;
  const warningCount = findings.filter((f) => f.severity === ControlSeverity.Warning).length;
  const infoCount = findings.filter((f) => f.severity === ControlSeverity.Info).length;

  return { findings, errorCount, warningCount, infoCount };
}
