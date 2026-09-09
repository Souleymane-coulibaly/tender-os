import type { CompanyBankAccountRecord } from "../../application/dtos";
import { maskIban } from "../../domain/bank-identifiers";

/**
 * Checkpoint TENDEROS-2.1-CCV2-C.1 — IBAN_RESPONSE_POLICY de la surface candidate.
 *
 * L'IBAN est masqué sur TOUTES les réponses : liste, création, modification, archivage. Aucun IBAN
 * complet ne quitte jamais l'API candidate.
 *
 * C'est STRICTEMENT PLUS STRICT que le chemin Legacy, qui masque en liste
 * (`maskBankAccountForList`) mais retourne l'enregistrement Prisma brut — donc l'IBAN complet — sur
 * création et modification. Cette divergence est délibérée et ne fait perdre aucune information :
 * l'appelant d'une création/modification vient d'envoyer l'IBAN lui-même. En contrepartie, un
 * utilisateur ne peut pas relire un IBAN déjà stocké ; c'est une décision produit à confirmer si
 * une vérification humaine du RIB devient nécessaire (voir rapport CCV2-C.1, P3).
 *
 * `clientAccountId` est retiré comme sur les autres surfaces candidate : pointeur de lignage
 * interne, jamais une identité exposée.
 */
export function presentCandidateBankAccount(record: CompanyBankAccountRecord): Record<string, unknown> {
  const { clientAccountId: _lineage, iban, ...rest } = record;
  return { ...rest, iban: maskIban(iban) };
}
