import { InvalidMarketTypeError } from "./errors";

/**
 * Nature du marché (mission architecture §5) — distincte de `source` (comment le Tender est
 * arrivé dans le système : MANUAL/BOAMP/TED/PRIVATE/OTHER, voir tender-source.ts) : `MarketType`
 * ne décrit que public vs privé, quel que soit le canal d'origine.
 */
export const MarketType = {
  Public: "PUBLIC",
  Private: "PRIVATE",
} as const;

export type MarketType = (typeof MarketType)[keyof typeof MarketType];

export function isMarketType(value: string): value is MarketType {
  return Object.values(MarketType).includes(value as MarketType);
}

export function parseMarketType(value: string): MarketType {
  if (!isMarketType(value)) {
    throw new InvalidMarketTypeError(value);
  }
  return value;
}
