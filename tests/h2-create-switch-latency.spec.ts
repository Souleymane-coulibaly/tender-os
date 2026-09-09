import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { ensureLoggedIn, readFixture } from "./fixtures";

/**
 * Checkpoint TENDEROS-2.1-H.2 — latence VISIBLE PAR L'UTILISATEUR et protection contre la double
 * soumission.
 *
 * La mesure serveur (spec d'intégration) situe la création et la bascule autour de 65 ms. Le constat
 * d'origine portait sur des dizaines de secondes RESSENTIES : la différence, s'il y en a une, se
 * joue donc entre l'action serveur Next.js, la revalidation et la navigation — parts qu'aucune
 * mesure d'API ne peut observer. C'est ce que ce fichier mesure, dans un vrai navigateur.
 *
 * Il ne s'agit pas d'un test de performance avec seuil serré : la borne posée est très large et ne
 * sert qu'à détecter l'ordre de grandeur pathologique signalé.
 */

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function setRole(organizationId: string, userId: string, roleCode: string): Promise<void> {
  const membership = await prisma.organizationMembership.findFirst({ where: { organizationId, userId } });
  if (!membership) throw new Error(`Aucune adhésion pour ${userId}`);
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) throw new Error(`Rôle inconnu : ${roleCode}`);
  await prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
  await prisma.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
}

test.describe("H.2 — latence visible et double soumission (preuves navigateur)", () => {
  // Next.js en mode dev compile chaque route au premier accès ; borne LOCALE, aucun délai global
  // n'est modifié.
  test.describe.configure({ timeout: 240000 });

  test.beforeEach(async () => {
    const fixture = readFixture();
    await setRole(fixture.organizationId, fixture.userId, "OWNER");
  });

  test("CRÉATION — le bouton se verrouille pendant l'envoi : un double clic ne crée qu'un seul appel d'offres", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);
    await page.goto("/app/tenders/new", { timeout: 180000 });

    const title = `H2 double clic ${Date.now()}`;
    // Client et entreprise candidate sont OBLIGATOIRES depuis CCV2-G.1 : on sélectionne la première
    // option réelle de chaque liste plutôt que de deviner un identifiant.
    const selects = page.locator("select#clientAccountId, select#candidateCompanyId");
    for (let index = 0; index < (await selects.count()); index += 1) {
      const options = await selects.nth(index).locator("option:not([disabled])").all();
      const value = await options[0]?.getAttribute("value");
      if (value) await selects.nth(index).selectOption(value);
    }
    await page.locator("input#title").fill(title);
    await page.locator("input#buyerName").fill("Commune de Test");

    // Le libellé du produit est sans accent (« Creer ») : on cible l'élément, pas une orthographe.
    const submit = page.locator("form button[type='submit']").last();
    await expect(submit).toBeEnabled();

    // Double clic RÉEL, sans délai : c'est le geste de l'utilisateur pressé, pas deux commandes
    // API distinctes. `noWaitAfter` évite que Playwright attende la navigation du premier clic et
    // masque ainsi le second.
    const started = Date.now();
    await submit.click({ noWaitAfter: true });
    await submit.click({ noWaitAfter: true, force: true }).catch(() => undefined);

    await page.waitForURL((url) => /\/app\/tenders\/[0-9a-f-]{36}/.test(url.pathname), { timeout: 180000 });
    const visibleMs = Date.now() - started;
    console.log("H2_BROWSER_CREATE_MS", visibleMs);

    // L'invariant produit : une seule intention, un seul appel d'offres.
    const created = await prisma.tender.count({ where: { organizationId: fixture.organizationId, title } });
    expect(created, "un double clic ne doit pas créer deux appels d'offres").toBe(1);

    // Borne large : on cherche les dizaines de secondes du constat, pas une cible de performance.
    expect(visibleMs, `durée visible ${visibleMs} ms`).toBeLessThan(30000);

    await prisma.tender.deleteMany({ where: { organizationId: fixture.organizationId, title } });
  });

  test("BASCULE DE CANDIDAT — durée visible mesurée et pas de double soumission", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);

    const candidates = await prisma.candidateCompany.findMany({
      where: { organizationId: fixture.organizationId, status: "ACTIVE" },
      select: { id: true, name: true },
      take: 2,
    });
    test.skip(candidates.length < 2, "deux entreprises candidates sont nécessaires pour mesurer une bascule réelle");

    const tender = await prisma.tender.findFirst({
      where: { organizationId: fixture.organizationId, candidateCompanyId: { not: null } },
      select: { id: true, candidateCompanyId: true },
    });
    test.skip(tender === null, "aucun appel d'offres rattaché à un candidat");

    const target = candidates.find((c) => c.id !== tender!.candidateCompanyId) ?? candidates[0]!;
    await page.goto(`/app/tenders/${tender!.id}`, { timeout: 180000 });

    const change = page.getByRole("button", { name: /entreprise candidate/i }).first();
    test.skip((await change.count()) === 0, "contrôle de bascule absent de cette fiche");
    await change.click();

    await page.locator("select#candidateCompanyId").selectOption(target.id);
    const confirm = page.getByRole("button", { name: "Confirmer", exact: true });

    const started = Date.now();
    await confirm.click({ noWaitAfter: true });
    await confirm.click({ noWaitAfter: true, force: true }).catch(() => undefined);

    await expect
      .poll(async () => (await prisma.tender.findUnique({ where: { id: tender!.id }, select: { candidateCompanyId: true } }))?.candidateCompanyId, { timeout: 120000 })
      .toBe(target.id);
    const visibleMs = Date.now() - started;
    console.log("H2_BROWSER_SWITCH_MS", visibleMs);

    // Un seul changement observable : la détection du no-op (H.2) neutralise la seconde soumission.
    const audits = await prisma.auditLog.count({
      where: { organizationId: fixture.organizationId, action: "tender.candidate_company_changed", resourceId: tender!.id },
    });
    expect(audits, "une seule bascule réelle, une seule trace d'audit").toBeLessThanOrEqual(1);
    expect(visibleMs, `durée visible ${visibleMs} ms`).toBeLessThan(30000);
  });
});
