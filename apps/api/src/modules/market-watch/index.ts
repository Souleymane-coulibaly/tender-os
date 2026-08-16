export { MarketWatchModule } from "./market-watch.module";

// V2 Sprint 25 (Dashboard Premium) — mission §25.63 "Opportunités recommandées" : premier
// consommateur externe de ce module (aucun barrel n'exportait de use case avant ce sprint), même
// motif de réexport ciblé que `workspace`/`response-package`/`opportunity` pour `dashboard`
// (Sprint 15) — jamais un second moteur de scoring/correspondance dupliqué pour l'aperçu Dashboard.
export { ListSavedSearchesUseCase } from "./application/use-cases/list-saved-searches.use-case";
export type { ListSavedSearchesQuery } from "./application/use-cases/list-saved-searches.use-case";
export { ListSavedSearchMatchesUseCase } from "./application/use-cases/list-saved-search-matches.use-case";
export type { ListSavedSearchMatchesQuery, SavedSearchMatchWithTender } from "./application/use-cases/list-saved-search-matches.use-case";
export { toSavedSearchMatchSummary } from "./application/dtos";
export type { SavedSearchSummary, SavedSearchMatchSummary } from "./application/dtos";
export { SavedSearchMatchStatus } from "./domain/enums";
