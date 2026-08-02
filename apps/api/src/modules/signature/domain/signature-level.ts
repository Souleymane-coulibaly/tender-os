/** Mission Sprint 8A §41 + documentation officielle Universign (services/transaction_service) —
 *  cinq niveaux réellement documentés : LEVEL0 (signature simple sans authentification), LEVEL1
 *  (signature simple), LEVEL2 (avancée, certificat LCP), LEVEL3 (avancée, certificat qualifié
 *  QCP-n), LEVEL4 (qualifiée, QCP-n-qscd). Ne suppose jamais qu'un niveau suffit par défaut —
 *  toujours une source explicite (DCE, confirmation humaine, ou capacités réelles du compte,
 *  cette dernière uniquement vérifiable au Sprint 8B). */
export const SignatureLevel = {
  Level0: "LEVEL0",
  Level1: "LEVEL1",
  Level2: "LEVEL2",
  Level3: "LEVEL3",
  Level4: "LEVEL4",
} as const;

export type SignatureLevel = (typeof SignatureLevel)[keyof typeof SignatureLevel];

export function isSignatureLevel(value: string): value is SignatureLevel {
  return (Object.values(SignatureLevel) as string[]).includes(value);
}

export const SIGNATURE_PROVIDER = {
  Fake: "FAKE",
  Universign: "UNIVERSIGN",
} as const;
export type SignatureProviderName = (typeof SIGNATURE_PROVIDER)[keyof typeof SIGNATURE_PROVIDER];
