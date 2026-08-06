import type { CompanyBankAccountRecord } from "../../application/dtos";

/** Mission §7 : l'IBAN/BIC complet ne doit être visible que via la permission bancaire dédiée déjà
 *  vérifiée par le use-case appelant — cette fonction masque néanmoins la réponse HTTP en LISTE
 *  (vue d'ensemble), l'IBAN complet restant disponible uniquement au détail explicite. */
export function maskBankAccountForList(account: CompanyBankAccountRecord): CompanyBankAccountRecord {
  return { ...account, iban: maskIban(account.iban) };
}

function maskIban(iban: string): string {
  if (iban.length <= 4) return "•".repeat(iban.length);
  return `${"•".repeat(iban.length - 4)}${iban.slice(-4)}`;
}
