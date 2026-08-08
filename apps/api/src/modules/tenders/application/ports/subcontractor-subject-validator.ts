/**
 * V2 Sprint 6 (correctif audit Codex P2 — sujet sous-traitant insuffisamment validé) — port propre
 * à `tenders` (même principe "le port vit dans le module qui l'utilise" déjà pratiqué par
 * `dce/application/ports/document-extraction-trigger.ts` et
 * `generation/application/ports/routing-policy-resolver.ts`) : `tenders` ne dépend jamais
 * directement du module `subcontractors` (créerait un cycle Nest — `subcontractors` importe déjà
 * `documents`, qui importe déjà `tenders`). L'implémentation réelle est fournie par un pont
 * `@Global()` côté `subcontractors` (`SubcontractorSubjectValidationBridgeModule`), qui délègue à
 * `GetSubcontractorProfileUseCase` — jamais une seconde requête Prisma dupliquant les règles du
 * module `subcontractors`.
 *
 * `@Optional()` côté appelant (`CreateChecklistItemUseCase`) pour rester bootable en isolation
 * (tests unitaires avec des fakes, notamment) — mais en production ce pont DOIT être importé dans
 * `AppModule` : sans lui, toute création avec `subjectSubcontractorProfileId` échoue explicitement
 * (fail-closed, jamais un contournement silencieux d'une vérification de sécurité).
 */
export interface SubcontractorSubjectValidator {
  /** Lève une erreur si le profil n'existe pas, n'appartient pas à `organizationId`, ou est
   *  archivé (retrait définitif — mission subcontractors §6). Ne vérifie jamais moins que ces trois
   *  conditions ; ne juge jamais du contenu métier du profil au-delà de son statut. */
  assertValid(input: { organizationId: string; subcontractorProfileId: string; actorRole: string }): Promise<void>;
}

export const SUBCONTRACTOR_SUBJECT_VALIDATOR = Symbol("SUBCONTRACTOR_SUBJECT_VALIDATOR");
