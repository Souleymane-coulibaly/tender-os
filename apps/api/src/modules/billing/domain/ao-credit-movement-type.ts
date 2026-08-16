/**
 * V2 Sprint 22 (billing, étape 22B) — mission §16 : jamais un simple solde mutable, chaque
 * mouvement est un type gouverné et audité. GRANT/CONSUMPTION sont émis par le système
 * (`GrantMonthlyAoCreditsUseCase`/`ConsumeAoCreditUseCase`) ; MANUAL_ADJUSTMENT/REVERSAL exigent un
 * Platform Admin + une raison obligatoire (mission §7/§31 — même discipline que
 * `EntitlementOverride`, jamais un chemin normal pour un Organization Admin).
 *
 * V2 Sprint 25 (Trial Starter) — TRIAL_GRANT ajouté : mission §17 "créer une source/type de grant
 * explicite... TRIAL_GRANT ou metadata/source équivalente" — jamais `balance = 1` directement,
 * jamais confondu avec un GRANT mensuel normal (période/plafond de rollover différents, idempotence
 * "au plus un par organisation, jamais un par mois" — voir la migration et
 * `GrantTrialAoCreditUseCase`).
 */
export const AoCreditMovementType = {
  Grant: "GRANT",
  TrialGrant: "TRIAL_GRANT",
  Consumption: "CONSUMPTION",
  ManualAdjustment: "MANUAL_ADJUSTMENT",
  Reversal: "REVERSAL",
} as const;

export type AoCreditMovementType = (typeof AoCreditMovementType)[keyof typeof AoCreditMovementType];

export function isAoCreditMovementType(value: string): value is AoCreditMovementType {
  return Object.values(AoCreditMovementType).includes(value as AoCreditMovementType);
}
