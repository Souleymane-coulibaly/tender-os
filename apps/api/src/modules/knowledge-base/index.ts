export { KnowledgeBaseModule } from "./knowledge-base.module";

// Réexporté uniquement pour permettre à Generation (Sprint 6) de fournir un contexte de citation
// (CRITERION_RESPONSE) — réutilise la recherche déjà scopée par client, jamais une seconde
// implémentation de recherche (même motif que le réexport de `GetTenderUseCase` par Tenders).
export { SearchKnowledgeBaseUseCase } from "./application/use-cases/search-knowledge-base.use-case";
export type { SearchKnowledgeBaseQuery, SearchKnowledgeBaseResult } from "./application/use-cases/search-knowledge-base.use-case";
