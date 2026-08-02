export { GenerationModule } from "./generation.module";

// Réexportés pour permettre au module Export (Sprint 8A) de sélectionner un contenu généré
// RÉEL (jamais recalculé, jamais relancé) au moment de l'assemblage documentaire — mission
// Sprint 8A §16 "consomme les ports publics existants... jamais une seconde lecture directe des
// tables". Ces use cases restent RBAC-gated en interne (ClientPermission.ReadGeneration), même
// motif que la réexportation de GetTenderUseCase par Tenders.
export { GetGenerationUseCase } from "./application/use-cases/get-generation.use-case";
export type { GetGenerationQuery } from "./application/use-cases/get-generation.use-case";
// Réexporté pour Sprint 8A.1 (Deliverables) — déclencher la génération IA d'une section de Mémoire
// technique en réutilisant CE moteur tel quel (`targetRef` = l'id de la `DeliverableSection`,
// mission §7 "ne recode pas un nouveau moteur IA"), jamais un second chemin de génération.
export { LaunchGenerationUseCase } from "./application/use-cases/launch-generation.use-case";
export type { LaunchGenerationCommand } from "./application/use-cases/launch-generation.use-case";
export type { GenerationTaskType } from "./domain/generation-task-type";
export { ListTenderGenerationsUseCase } from "./application/use-cases/list-tender-generations.use-case";
export type { ListTenderGenerationsQuery, ListTenderGenerationsResult } from "./application/use-cases/list-tender-generations.use-case";
export { ListGenerationVersionsUseCase } from "./application/use-cases/list-generation-versions.use-case";
export type { ListGenerationVersionsQuery } from "./application/use-cases/list-generation-versions.use-case";
export type { GenerationSummary } from "./application/dtos";
