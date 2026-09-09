/**
 * Checkpoint TENDEROS-2.1-CCV2-D — rétrécissement d'accès documentaire dépendant du DOMAINE MÉTIER
 * qui possède le document.
 *
 * POURQUOI CE PORT EXISTE. `assertDocumentClientAccess` documente explicitement qu'« un document
 * SANS aucune association de Tender reste un document d'organisation classique (aucune restriction
 * client supplémentaire) ». C'est correct pour un Kbis, mais faux pour un RIB : `DocumentPermission.
 * Download` est accordé à TOUS les rôles, y compris `READ_ONLY` et `EXTERNAL_CONSULTANT`. Un
 * justificatif bancaire stocké comme Document générique était donc téléchargeable par n'importe
 * quel membre de l'organisation, contournant la frontière `candidate:read_banking` posée en
 * CCV2-C.1.
 *
 * Ce module ne connaît — et ne doit connaître — ni CandidateCompany ni les permissions bancaires.
 * Il expose donc un point d'extension OPTIONNEL ; l'implémentation est fournie par le module
 * propriétaire du sens métier (`company-profile`) via un module bridge `@Global()`, même motif que
 * `MembershipSeatLimitBridgeModule` / `AiSuggestionBridgeModule` / `TenderAnalysisStateBridgeModule`.
 *
 * Absent (aucun bridge enregistré) : comportement strictement inchangé — jamais un durcissement
 * implicite, jamais un relâchement.
 */
export interface DocumentAccessNarrowingPolicy {
  /**
   * Checkpoint TENDEROS-2.1-CCV2-I.3 — variante EN LOT, pour les LISTES.
   *
   * `assertReadable` lève une erreur : ce contrat est juste pour un accès unitaire, mais inutilisable
   * sur une liste, où le comportement attendu n'est pas d'échouer mais de ne pas montrer. Appeler
   * `assertReadable` une fois par ligne produirait par ailleurs jusqu'à 100 requêtes par page.
   *
   * Retourne le sous-ensemble des identifiants que l'acteur peut voir, dans l'ordre reçu. OPTIONNELLE
   * — une implémentation qui ne la fournit pas laisse le comportement de liste strictement inchangé,
   * même discipline que l'absence totale de bridge.
   */
  filterReadable?(
    input: Readonly<{ organizationId: string; documentIds: readonly string[]; actorRole: string }>,
  ): Promise<readonly string[]>;

  /**
   * Lève une erreur de DOMAINE si l'acteur ne peut pas voir/télécharger CE document en raison du
   * domaine métier auquel il est rattaché. Ne retourne jamais un booléen : l'erreur levée porte la
   * convention anti-énumération correcte (404 ou 403 selon le cas), que ce module ne doit pas
   * réinterpréter.
   */
  assertReadable(input: Readonly<{ organizationId: string; documentId: string; actorRole: string }>): Promise<void>;
}

export const DOCUMENT_ACCESS_NARROWING = Symbol("DOCUMENT_ACCESS_NARROWING");
