import { randomUUID } from "node:crypto";
import { EmailAddress } from "../src/modules/identity/domain/email-address.value-object";
import { User } from "../src/modules/identity/domain/user.aggregate";
import { UserId } from "../src/modules/identity/domain/user-id.value-object";
import { PrismaUserRepository } from "../src/modules/identity/infrastructure/prisma-user.repository";
import { ScryptPasswordHasher } from "../src/modules/identity/infrastructure/scrypt-password-hasher";
import { MembershipId } from "../src/modules/memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../src/modules/memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../src/modules/memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../src/modules/memberships/infrastructure/prisma-membership.repository";
import { PrismaService } from "../src/shared-kernel/prisma.service";

/**
 * Correctif audit Codex P2-003 — seed dédié aux preuves Playwright : crée une organisation, un
 * utilisateur OWNER, un client, un Tender et un template de mémoire actif, tous frais à chaque
 * exécution (préfixe aléatoire), pour donner aux tests e2e un état réel et isolé — jamais une
 * simulation. Écrit le résultat en JSON sur stdout (dernière ligne) pour que
 * `tests/global-setup.ts` puisse le récupérer sans dépendance à un fichier partagé.
 *
 * V2 Sprint 1 §5 — ajoute une seconde organisation isolée (`other`) : nécessaire au scénario E2E
 * anti-IDOR (`tests/multi-tenant-isolation.spec.ts`), qui doit prouver qu'un utilisateur
 * authentifié d'une organisation ne peut pas accéder à une ressource d'une autre organisation via
 * l'UI/API réelle. Champ additif — ne modifie aucun champ existant du fixture.
 */
async function createOrgWithOwnerAndTender(input: { runId: string; label: string; passwordHasher: ScryptPasswordHasher; userRepository: PrismaUserRepository; membershipRepository: PrismaMembershipRepository; prisma: PrismaService }) {
  const { runId, label, passwordHasher, userRepository, membershipRepository, prisma } = input;
  const email = `e2e-${label}-${runId}@playwright.test`;
  const password = "PlaywrightE2E#12345";

  const organizationId = randomUUID();
  await prisma.organization.create({
    data: { id: organizationId, name: `E2E Org ${label} ${runId}`, slug: `e2e-org-${label}-${runId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
  });

  const passwordHash = await passwordHasher.hash(password);
  const user = User.register({ id: UserId.from(randomUUID()), email: EmailAddress.create(email), displayName: `Playwright E2E ${label}`, passwordHash, occurredAt: new Date() });
  await userRepository.save(user);
  const userId = user.id.value;

  await membershipRepository.save(OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId, userId, role: OrganizationRole.Owner, occurredAt: new Date() }));

  const clientAccountId = randomUUID();
  await prisma.clientAccount.create({
    data: { id: clientAccountId, organizationId, name: `Client E2E ${label} ${runId}`, nameNormalized: `client e2e ${label} ${runId}`, status: "ACTIVE", createdBy: userId },
  });

  const tenderId = randomUUID();
  await prisma.tender.create({
    data: { id: tenderId, organizationId, clientAccountId, title: `Marché Playwright ${label} ${runId}`, status: "DRAFT", tags: [], createdBy: userId },
  });

  return { email, password, organizationId, userId, clientAccountId, tenderId };
}

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    const runId = randomUUID().slice(0, 8);
    const email = `e2e-${runId}@playwright.test`;
    const password = "PlaywrightE2E#12345";

    const organizationId = randomUUID();
    await prisma.organization.create({
      data: { id: organizationId, name: `E2E Org ${runId}`, slug: `e2e-org-${runId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });

    const passwordHasher = new ScryptPasswordHasher();
    const userRepository = new PrismaUserRepository(prisma);
    const passwordHash = await passwordHasher.hash(password);
    const user = User.register({ id: UserId.from(randomUUID()), email: EmailAddress.create(email), displayName: "Playwright E2E", passwordHash, occurredAt: new Date() });
    await userRepository.save(user);
    const userId = user.id.value;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId, userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    const clientAccountId = randomUUID();
    await prisma.clientAccount.create({
      data: { id: clientAccountId, organizationId, name: `Client E2E ${runId}`, nameNormalized: `client e2e ${runId}`, status: "ACTIVE", createdBy: userId },
    });

    // V2 Sprint 5 (audit Codex round 2, P1 confirmé) — décider/promouvoir un GO/NO-GO exige
    // désormais une VRAIE affectation CLIENT_MANAGER sur le client, même pour un OWNER (voir
    // `resolveGoNoGoClientAccess`) : sans elle, l'OWNER de ce seed tomberait dans le filet de
    // secours administratif TRACÉ et exigerait une justification que les specs Playwright
    // (`opportunity-go-no-go.spec.ts`) ne fournissent pas — elles exercent le "chemin normal".
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId, clientAccountId, userId, role: "CLIENT_MANAGER", createdBy: userId },
    });

    const tenderId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderId, organizationId, clientAccountId, title: `Marché Playwright ${runId}`, status: "DRAFT", tags: [], createdBy: userId },
    });

    // Template ORGANIZATION-scope actif pour TECHNICAL_MEMO — pour que la page Mémoire technique
    // ait au moins une section réelle à afficher/éditer (sans dépendre du repli TENDEROS, déjà
    // couvert par ses propres tests backend).
    const templateId = randomUUID();
    await prisma.deliverableTemplate.create({
      data: { id: templateId, organizationId, scopeLevel: "ORGANIZATION", documentType: "TECHNICAL_MEMO", name: `Modèle E2E ${runId}`, createdBy: userId },
    });
    const templateVersionId = randomUUID();
    await prisma.deliverableTemplateVersion.create({
      data: { id: templateVersionId, organizationId, deliverableTemplateId: templateId, version: 1, status: "ACTIVE", createdBy: userId, activatedAt: new Date() },
    });
    await prisma.deliverableTemplateSection.create({
      data: { id: randomUUID(), organizationId, deliverableTemplateVersionId: templateVersionId, code: "INTRO", title: "Introduction", order: 0, headingLevel: 1, requirement: "MANDATORY" },
    });

    const other = await createOrgWithOwnerAndTender({ runId, label: "other", passwordHasher, userRepository, membershipRepository, prisma });

    // V2 Sprint 5 (GO/NO-GO IA) — un second Tender de la MÊME organisation, avec une analyse IA du
    // DCE déjà réussie (`TenderAnalysisSummary` + `AnalysisJob` seedés directement, sans dépendre
    // d'une clé API IA réelle — absente de cet environnement Playwright, voir `cockpit.spec.ts`).
    // Donne au scénario E2E Niveau 2 (`opportunity-go-no-go.spec.ts`) un Tender pour lequel générer
    // un vrai `GoNoGoReport` via l'UI, sans jamais simuler la génération elle-même côté test.
    const tenderWithAnalysisId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderWithAnalysisId, organizationId, clientAccountId, title: `Marché Playwright avec analyse ${runId}`, status: "IN_ANALYSIS", tags: [], createdBy: userId },
    });
    const analysisJobId = randomUUID();
    await prisma.analysisJob.create({
      data: {
        id: analysisJobId,
        organizationId,
        tenderId: tenderWithAnalysisId,
        targetId: tenderWithAnalysisId,
        scope: "TENDER",
        status: "SUCCEEDED",
        analysisVersion: 1,
        promptVersion: 1,
        triggeredByRole: "OWNER",
        updatedAt: new Date(),
      },
    });
    await prisma.tenderAnalysisSummary.create({
      data: {
        id: randomUUID(),
        organizationId,
        tenderId: tenderWithAnalysisId,
        analysisJobId,
        analysisVersion: 1,
        opportunitySummary: `Marché Playwright avec analyse ${runId} — DCE complet, aucun blocage identifié.`,
        complexityLevel: "MEDIUM",
        goNoGoRecommendation: "GO",
        goNoGoRationale: "Dossier complet, synthèse IA de démonstration pour la preuve Playwright.",
      },
    });

    console.log(JSON.stringify({ email, password, organizationId, userId, clientAccountId, tenderId, tenderWithAnalysisId, other }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
