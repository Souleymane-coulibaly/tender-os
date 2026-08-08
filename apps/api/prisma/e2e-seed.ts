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
import { PrismaBusinessAnalysisRepository } from "../src/modules/analysis/infrastructure/prisma-business-analysis.repository";
import type { TenderConsolidationOutput } from "../src/modules/analysis/application/schemas/business/tender-consolidation-output.schema";

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

    // V2 Sprint 7 (Workspace collaboratif) — second membre RÉEL de la MÊME organisation, avec un
    // accès client réel (`ClientAssignment` CONTRIBUTOR, jamais le filet de secours administratif),
    // nécessaire aux preuves E2E de collaboration : ajout comme participant, tâche assignée,
    // connexion séparée, commentaire, mention — un second acteur réel, jamais un seul utilisateur
    // qui s'auto-valide (mission §30).
    const collaboratorEmail = `e2e-collaborator-${runId}@playwright.test`;
    const collaboratorPassword = "PlaywrightE2E#12345";
    const collaboratorUser = User.register({
      id: UserId.from(randomUUID()),
      email: EmailAddress.create(collaboratorEmail),
      displayName: "Playwright E2E Collaborateur",
      passwordHash: await passwordHasher.hash(collaboratorPassword),
      occurredAt: new Date(),
    });
    await userRepository.save(collaboratorUser);
    const collaboratorUserId = collaboratorUser.id.value;
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId, userId: collaboratorUserId, role: OrganizationRole.Contributor, occurredAt: new Date() }),
    );
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId, clientAccountId, userId: collaboratorUserId, role: "CONTRIBUTOR", createdBy: userId },
    });

    // V2 Sprint 7 — second CLIENT de la MÊME organisation, sur lequel le collaborateur n'a AUCUNE
    // affectation (mission §5/§63 : l'isolation same-org cross-client, jamais couverte par la seule
    // isolation inter-organisation). Réservé au scénario E2E de sécurité Workspace — et, depuis le
    // V2 Sprint 8, réutilisé tel quel (même `clientAccountId`, désormais exposé) pour la preuve
    // Knowledge Base équivalente (mission §64/§70).
    const otherClientAccountId = randomUUID();
    await prisma.clientAccount.create({
      data: { id: otherClientAccountId, organizationId, name: `Client E2E B ${runId}`, nameNormalized: `client e2e b ${runId}`, status: "ACTIVE", createdBy: userId },
    });
    const tenderInOtherClientId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderInOtherClientId, organizationId, clientAccountId: otherClientAccountId, title: `Marché Playwright Client B ${runId}`, status: "DRAFT", tags: [], createdBy: userId },
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
    // V2 Sprint 6 (Checklist intelligente DCE) — findings réels (Requirement/Criterion/Deadline)
    // rattachés à `tenderWithAnalysisId`, persistés via le même chemin que la vraie consolidation
    // IA (`PrismaBusinessAnalysisRepository.persistTenderConsolidation`, motif déjà prouvé par
    // `checklist-intelligence-http.integration.spec.ts`). Donne au scénario E2E
    // (`checklist-intelligence.spec.ts`) une matière réelle pour générer des `AiSuggestion`
    // (`CHECKLIST_ITEM`) via l'UI — jamais une checklist simulée côté test. Un Requirement
    // (redirection Sprint 6 → CHECKLIST_ITEM), un Criterion éliminatoire (§9 : suggestion
    // additionnelle uniquement si `isEliminatory`), une Deadline de type VISIT (§9 : suggestion
    // additionnelle uniquement pour ce type) — chacun couvre une branche gouvernée distincte du
    // mapping, jamais "un finding = un item".
    const businessAnalysisRepository = new PrismaBusinessAnalysisRepository(prisma);
    const consolidationOutput: TenderConsolidationOutput = {
      metadata: {},
      deadlines: [
        {
          kind: "VISIT",
          label: "Visite obligatoire du site avant remise des offres",
          date: "2027-01-15T09:00:00.000Z",
          rawText: "Avant la date limite de remise des plis",
          isInferred: false,
          confidence: 0.8,
        },
      ],
      criteria: [
        { name: "Conformité administrative du dossier", weight: 10, isEliminatory: true, isInferred: false, confidence: 0.8 },
      ],
      requirements: [
        { category: "ADMINISTRATIVE", label: "Attestation d'assurance responsabilité civile professionnelle", isMandatory: true, isInferred: false, confidence: 0.8 },
      ],
      clauses: [],
      risks: [],
      questions: [],
      summary: {
        opportunitySummary: `Marché Playwright avec analyse ${runId} — DCE complet, aucun blocage identifié.`,
        complexityLevel: "MEDIUM",
        mainCriteria: [],
        mainRisks: [],
        mainObligations: [],
        missingElements: [],
        pointsToClarify: [],
        conflicts: [],
        goNoGoRecommendation: "GO",
        goNoGoRationale: "Dossier complet, synthèse IA de démonstration pour la preuve Playwright.",
      },
    } as TenderConsolidationOutput;
    await prisma.$transaction((tx) =>
      businessAnalysisRepository.persistTenderConsolidation(tx, {
        organizationId,
        analysisJobId,
        analysisVersion: 1,
        tenderId: tenderWithAnalysisId,
        output: consolidationOutput,
        documentVersionsByDocumentId: {},
      }),
    );

    console.log(
      JSON.stringify({
        email,
        password,
        organizationId,
        userId,
        clientAccountId,
        tenderId,
        tenderWithAnalysisId,
        collaboratorEmail,
        collaboratorPassword,
        collaboratorUserId,
        tenderInOtherClientId,
        otherClientAccountId,
        other,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
