import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * V2 Sprint 1 §5 — "nettoyage reproductible" : supprime les deux organisations seedées par
 * `tests/global-setup.ts`/`apps/api/prisma/e2e-seed.ts` (cascade Prisma sur toutes les tables
 * dépendantes) une fois la suite Playwright terminée, pour qu'une exécution locale répétée
 * n'accumule pas indéfiniment des organisations de test orphelines. Best-effort : n'échoue jamais
 * la suite si le nettoyage lui-même rencontre un problème (le fixture peut être absent si
 * `global-setup` a échoué avant de l'écrire).
 */
export default async function globalTeardown(): Promise<void> {
  const fixturePath = path.resolve(__dirname, ".e2e-fixture.json");
  if (!existsSync(fixturePath)) {
    return;
  }

  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
    organizationId: string;
    userId: string;
    other?: { organizationId: string; userId: string };
    cockpit?: { organizationId: string; userId: string };
  };
  const organizationIds = [fixture.organizationId, fixture.other?.organizationId, fixture.cockpit?.organizationId].filter((id): id is string => Boolean(id));
  const userIds = [fixture.userId, fixture.other?.userId, fixture.cockpit?.userId].filter((id): id is string => Boolean(id));

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    for (const organizationId of organizationIds) {
      // Ordre enfants → parents pour les données réellement créées par les specs existantes
      // (cockpit/livrables/mémoire-technique/templates-thèmes) — best-effort, chaque table
      // manquante ici est absorbée par le catch englobant, jamais un échec de suite.
      // V2 Sprint 19 (connecteurs) — `SyncConfiguration`/`CalendarSyncedEvent` cascadent déjà via
      // leur FK vers `ExternalConnection` (onDelete: Cascade) ; `OAuthFlowState` n'a aucune FK
      // (même motif que le reste du schéma : organizationId en colonne simple, jamais une FK dure
      // vers `Organization`), donc supprimé explicitement ici.
      await prisma.oAuthFlowState.deleteMany({ where: { organizationId } });
      await prisma.externalConnection.deleteMany({ where: { organizationId } });
      await prisma.deliverableExportSelection.deleteMany({ where: { organizationId } });
      await prisma.deliverableComment.deleteMany({ where: { organizationId } });
      await prisma.deliverableReview.deleteMany({ where: { organizationId } });
      await prisma.deliverableRevision.deleteMany({ where: { organizationId } });
      await prisma.deliverableSection.deleteMany({ where: { organizationId } });
      await prisma.deliverable.deleteMany({ where: { organizationId } });
      await prisma.deliverableTemplateSection.deleteMany({ where: { organizationId } });
      await prisma.deliverableTemplateVersion.deleteMany({ where: { organizationId } });
      await prisma.deliverableTemplate.deleteMany({ where: { organizationId } });
      await prisma.documentThemeVersion.deleteMany({ where: { organizationId } });
      await prisma.documentTheme.deleteMany({ where: { organizationId } });
      await prisma.documentExtraction.deleteMany({ where: { organizationId } });
      await prisma.analysisJob.deleteMany({ where: { organizationId } });
      await prisma.dceDocument.deleteMany({ where: { organizationId } });
      await prisma.dceImportJob.deleteMany({ where: { organizationId } });
      await prisma.dce.deleteMany({ where: { organizationId } });
      await prisma.documentTenderAssociation.deleteMany({ where: { organizationId } });
      await prisma.documentVersion.deleteMany({ where: { organizationId } });
      await prisma.document.deleteMany({ where: { organizationId } });
      // V2 Sprint 5 (GO/NO-GO IA) — `Opportunity.clientAccountId`/`.tenderId` sont en ON DELETE
      // RESTRICT (jamais cascade, "référence sans possession", voir la migration) : ces lignes
      // doivent être supprimées AVANT `tender`/`clientAccount` ci-dessous, sans quoi leur suppression
      // échoue silencieusement et interrompt le nettoyage du reste de cette organisation.
      await prisma.goNoGoDecision.deleteMany({ where: { organizationId } });
      await prisma.goNoGoReport.deleteMany({ where: { organizationId } });
      await prisma.opportunityQuickScore.deleteMany({ where: { organizationId } });
      await prisma.opportunity.deleteMany({ where: { organizationId } });
      await prisma.tender.deleteMany({ where: { organizationId } });
      // Checkpoint TENDEROS-2.1-CCV2-F.1 — entreprises candidates seedees + tout ce qu'une spec a pu
      // leur rattacher via l'UI reelle. AVANT `clientAccount` et `organization` : `CandidateCompany`
      // porte une FK dure vers `Organization`, et ses satellites une FK vers elle. Les associations
      // documentaires cascadent deja depuis `document` (supprime plus haut), mais sont nettoyees
      // explicitement pour ne rien dependre de l'ordre.
      await prisma.documentCandidateCompanyAssociation.deleteMany({ where: { organizationId } });
      await prisma.companyRepresentative.deleteMany({ where: { organizationId, candidateCompanyId: { not: null } } });
      await prisma.companyBankAccount.deleteMany({ where: { organizationId, candidateCompanyId: { not: null } } });
      await prisma.companyCertification.deleteMany({ where: { organizationId, candidateCompanyId: { not: null } } });
      await prisma.companyInsurance.deleteMany({ where: { organizationId, candidateCompanyId: { not: null } } });
      await prisma.companyReference.deleteMany({ where: { organizationId, candidateCompanyId: { not: null } } });
      await prisma.companyHumanResource.deleteMany({ where: { organizationId, candidateCompanyId: { not: null } } });
      await prisma.companyMaterialResource.deleteMany({ where: { organizationId, candidateCompanyId: { not: null } } });
      await prisma.candidateEstablishment.deleteMany({ where: { organizationId } });
      await prisma.candidateCompany.deleteMany({ where: { organizationId } });
      // V2 Sprint 8 (Bibliothèque intelligente) — `KnowledgeEntry.clientAccountId` est aussi une
      // FK vers `clientAccount` : à supprimer AVANT `clientAccount` ci-dessous, même motif que
      // `Opportunity` ci-dessus.
      await prisma.knowledgeEntryTag.deleteMany({ where: { organizationId } });
      await prisma.knowledgeChunk.deleteMany({ where: { organizationId } });
      await prisma.knowledgeDocument.deleteMany({ where: { organizationId } });
      await prisma.knowledgeEntryVersion.deleteMany({ where: { organizationId } });
      await prisma.knowledgeEntry.deleteMany({ where: { organizationId } });
      await prisma.knowledgeTag.deleteMany({ where: { organizationId } });
      await prisma.knowledgeSpace.deleteMany({ where: { organizationId } });
      // V2 Sprint 5 (audit Codex round 2) — le seed crée désormais une ClientAssignment
      // (CLIENT_MANAGER) pour que l'OWNER e2e emprunte le chemin normal GO/NO-GO ; à supprimer
      // avant `clientAccount` (même motif de FK que ci-dessus).
      await prisma.clientAssignment.deleteMany({ where: { organizationId } });
      await prisma.clientAccount.deleteMany({ where: { organizationId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
      // Gap préexistant révélé par ce sprint (Opportunity/promotion écrivent plusieurs événements
      // Outbox) — jamais nettoyé jusqu'ici, ce qui bloquait la suppression de l'organisation dès
      // qu'assez d'événements s'accumulaient (FK `outbox_events_organization_id_fkey`).
      await prisma.outboxEvent.deleteMany({ where: { organizationId } });
      await prisma.organizationMembership.deleteMany({ where: { organizationId } });
      // Organisation `cockpit` (abonnée) — l'abonnement seedé doit partir avant l'organisation.
      await prisma.organizationSubscription.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } catch (error) {
    console.warn("global-teardown: nettoyage best-effort incomplet (n'échoue pas la suite) :", error);
  } finally {
    await prisma.$disconnect();
    unlinkSync(fixturePath);
  }
}
