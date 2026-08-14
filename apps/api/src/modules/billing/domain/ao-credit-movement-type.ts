/**
 * V2 Sprint 22 (billing, étape 22B) — mission §16 : jamais un simple solde mutable, chaque
 * mouvement est un type gouverné et audité. GRANT/CONSUMPTION sont émis par le système
 * (`GrantMonthlyAoCreditsUseCase`/`ConsumeAoCreditUseCase`) ; MANUAL_ADJUSTMENT/REVERSAL exigent un
 * Platform Admin + une raison obligatoire (mission §7/§31 — même discipline que
 * `EntitlementOverride`, jamais un chemin normal pour un Organization Admin).
 */
export const AoCreditMovementType = {
  Grant: "GRANT",
  Consumption: "CONSUMPTION",
  ManualAdjustment: "MANUAL_ADJUSTMENT",
  Reversal: "REVERSAL",
} as const;

export type AoCreditMovementType = (typeof AoCreditMovementType)[keyof typeof AoCreditMovementType];

export function isAoCreditMovementType(value: string): value is AoCreditMovementType {
  return Object.values(AoCreditMovementType).includes(value as AoCreditMovementType);
}
