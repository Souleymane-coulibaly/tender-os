/**
 * Mission Sprint 7 §"Principe juridique et UX obligatoire" — texte de référence FIXE, jamais
 * paraphrasé par un contrôleur ou le frontend. `ESTIMATE_DISCLAIMER_VERSION` permet de faire
 * évoluer ce texte plus tard sans jamais modifier son sens sur une version d'estimation déjà
 * persistée (chaque `PricingEstimateVersion` fige la version du disclaimer en vigueur au moment de
 * sa création, jamais recalculée rétroactivement si ce texte change).
 */
export const ESTIMATE_DISCLAIMER_VERSION = 1;

export const ESTIMATE_DISCLAIMER_TEXT =
  "Estimation indicative et non contractuelle. Ce montant est calculé à partir des données " +
  "disponibles, des hypothèses renseignées et des tarifs connus au moment du calcul. Il ne " +
  "constitue ni un prix réel garanti du marché, ni une offre commerciale ferme, ni un engagement " +
  "contractuel. Le montant réel peut varier selon les fournisseurs, les volumes, les conditions " +
  "d'exécution, les ressources mobilisées et les évolutions tarifaires.";
