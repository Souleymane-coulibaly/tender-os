/**
 * Réaudit Codex Sprint 7 — "devise non validée ISO/supportée" : un format 3-lettres seul ne suffit
 * pas (`"XYZ"` est syntaxiquement valide mais n'est pas une devise réelle) — voir
 * `Money.normalizeCurrency()`. Liste INTENTIONNELLEMENT restreinte à la V1 (mission "ne crée pas
 * des dizaines de devises inutiles" / "ne construis pas un moteur universel spéculatif") : EUR par
 * défaut (mission §"Devise"), USD pour les tarifs IA réels (les pricing snapshots Sprint 5.2
 * observés dans ce dépôt sont exclusivement EUR/USD), GBP/CHF pour couvrir les organisations
 * européennes hors zone euro sans convertir automatiquement (mission "aucune conversion sans
 * source de taux"). Extensible par un simple ajout ici, jamais une migration.
 */
export const SUPPORTED_CURRENCIES = ["EUR", "USD", "GBP", "CHF"] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}
