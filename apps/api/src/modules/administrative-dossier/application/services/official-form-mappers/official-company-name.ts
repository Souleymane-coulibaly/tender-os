/**
 * Checkpoint TENDEROS-2.1-H.6 — valeur du champ officiel « nom commercial ET dénomination sociale ».
 *
 * Ferme `DEFERRED-G-03`. Les trois formulaires (DC1 P46, DC2 P37, DC4 P50/P72) exposent un champ
 * COMBINÉ : le libellé officiel demande le nom commercial **et** la dénomination sociale, ce que la
 * documentation des gabarits du dépôt confirme mot pour mot (« nom commercial / dénomination
 * sociale »). Ce n'est donc pas un champ de nom commercial, ni un champ de dénomination sociale :
 * c'est un champ qui réclame les deux.
 *
 * ÉTAT PRÉCÉDENT ET POURQUOI IL FALLAIT LE CORRIGER : les mappeurs y plaçaient
 * `candidateIdentity.displayName`, c'est-à-dire `legalName ?? name`. La moitié juridiquement
 * indispensable était donc présente — la valeur n'était pas fausse — mais la moitié commerciale
 * était systématiquement omise, alors même que `tradeName` existe depuis CCV2-F.1 et que
 * l'utilisateur peut le renseigner depuis F.2. Un champ éditable qui n'atteint jamais le document
 * officiel est une promesse non tenue.
 *
 * RÈGLE RETENUE, et l'ordre n'est pas anodin : la dénomination sociale vient TOUJOURS en premier,
 * le nom commercial entre parenthèses. Placer le nom commercial en tête aurait risqué qu'un lecteur
 * — ou un acheteur public — le prenne pour l'identité juridique du soumissionnaire. La dénomination
 * sociale reste ainsi la lecture immédiate, et le nom commercial une précision explicitement
 * étiquetée comme telle.
 *
 * Le nom commercial n'est JAMAIS émis seul : il ne peut pas tenir lieu d'identité juridique
 * (mission §9). En son absence, ou s'il est identique à la dénomination sociale, la valeur reste
 * exactement celle d'avant ce checkpoint — aucune régression de sortie.
 */
export function buildOfficialCompanyName(input: {
  /** Dénomination sociale, ou à défaut le nom d'usage de l'entreprise candidate. */
  legalOrDisplayName?: string | undefined;
  /** Nom commercial déclaré, s'il existe. */
  tradeName?: string | undefined;
}): string | undefined {
  const legal = normalize(input.legalOrDisplayName);
  const trade = normalize(input.tradeName);

  if (legal === undefined) {
    // Sans identité juridique, on n'invente rien : le champ reste vide et sera signalé manquant par
    // le mécanisme de complétude du formulaire, plutôt que rempli d'un nom commercial trompeur.
    return undefined;
  }
  if (trade === undefined || trade.toLocaleLowerCase("fr") === legal.toLocaleLowerCase("fr")) {
    return legal;
  }
  return `${legal} (${trade})`;
}

function normalize(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}
