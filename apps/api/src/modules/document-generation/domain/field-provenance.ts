/** Traçabilité champ par champ d'une révision générée (mission "groundwork Sprint 11" — provenance
 *  au niveau du champ). Ce module ignore délibérément la sémantique métier de `sourceEntityType`/
 *  `sourceEntityId` : ce sont des chaînes libres fournies par l'APPELANT (ex. Sprint 11 passera
 *  "Tender"/le tenderId réel), jamais interprétées ni validées ici — aucune logique métier DC1/DC2/
 *  DC4/ATTRI1 dans ce module. */
export type FieldProvenanceEntry = Readonly<{
  fieldKey: string;
  provided: boolean;
  sourceEntityType?: string | undefined;
  sourceEntityId?: string | undefined;
  sourceEntityVersion?: string | undefined;
  valuePath?: string | undefined;
}>;
