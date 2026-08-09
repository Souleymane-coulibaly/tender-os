export { KnowledgeBaseModule } from "./knowledge-base.module";

// Réexporté uniquement pour permettre à Generation (Sprint 6) de fournir un contexte de citation
// (CRITERION_RESPONSE) — réutilise la recherche déjà scopée par client, jamais une seconde
// implémentation de recherche (même motif que le réexport de `GetTenderUseCase` par Tenders).
export { SearchKnowledgeBaseUseCase } from "./application/use-cases/search-knowledge-base.use-case";
export type { SearchKnowledgeBaseQuery, SearchKnowledgeBaseResult } from "./application/use-cases/search-knowledge-base.use-case";

// V2 Sprint 9 (correctif audit Codex P1) — réexporté UNIQUEMENT pour `chat` : une citation
// KNOWLEDGE_ENTRY doit désigner la version EXACTE (validée) réellement utilisée, jamais seulement
// l'entrée — `SearchKnowledgeBaseUseCase` n'expose que `activeVersionNumber` (un numéro, pas un
// identifiant), résolu ici en un identifiant réel de `KnowledgeEntryVersion`.
export { GetKnowledgeVersionUseCase } from "./application/use-cases/get-knowledge-version.use-case";
export type { GetKnowledgeVersionQuery } from "./application/use-cases/get-knowledge-version.use-case";
export type { KnowledgeEntryVersionSummary } from "./application/dtos";
export { KnowledgeEntryNotFoundError, KnowledgeEntryVersionNotFoundError } from "./domain/errors";
