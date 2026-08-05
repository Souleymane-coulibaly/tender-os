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
  };
  const organizationIds = [fixture.organizationId, fixture.other?.organizationId].filter((id): id is string => Boolean(id));
  const userIds = [fixture.userId, fixture.other?.userId].filter((id): id is string => Boolean(id));

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    for (const organizationId of organizationIds) {
      // Ordre enfants → parents pour les données réellement créées par les specs existantes
      // (cockpit/livrables/mémoire-technique/templates-thèmes) — best-effort, chaque table
      // manquante ici est absorbée par le catch englobant, jamais un échec de suite.
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
      await prisma.tender.deleteMany({ where: { organizationId } });
      await prisma.clientAccount.deleteMany({ where: { organizationId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
      await prisma.organizationMembership.deleteMany({ where: { organizationId } });
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
