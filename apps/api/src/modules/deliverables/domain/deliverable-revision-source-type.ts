/** Mission §9/§10 — provenance d'une révision : générée par IA (Sprint 6), rédigée manuellement,
 *  ou restaurée depuis une ancienne révision (mission §9 "restaurer une ancienne version comme une
 *  NOUVELLE révision" — jamais un retour en arrière destructif). */
export const DeliverableRevisionSourceType = {
  AiGenerated: "AI_GENERATED",
  Manual: "MANUAL",
  Restored: "RESTORED",
} as const;

export type DeliverableRevisionSourceType = (typeof DeliverableRevisionSourceType)[keyof typeof DeliverableRevisionSourceType];

export function isDeliverableRevisionSourceType(value: string): value is DeliverableRevisionSourceType {
  return Object.values(DeliverableRevisionSourceType).includes(value as DeliverableRevisionSourceType);
}
