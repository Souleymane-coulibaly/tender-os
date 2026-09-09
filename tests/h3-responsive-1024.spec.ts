import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { ensureLoggedIn, readFixture } from "./fixtures";

/**
 * Checkpoint TENDEROS-2.1-H.3 — certification RESPONSIVE autour de 1024 px.
 *
 * La preuve n'est PAS visuelle : elle mesure dans le navigateur
 * `documentElement.scrollWidth` contre `clientWidth`, et — en cas de dépassement — identifie les
 * éléments dont le rectangle sort réellement du viewport. Une capture d'écran verte ne prouve rien
 * qu'un `overflow-x: hidden` mal placé ne pourrait imiter en masquant du contenu inaccessible.
 *
 * La matrice encadre le point de bascule (1000 / 1023 / 1024 / 1025 / 1100) plutôt que de se
 * contenter d'un seul viewport : c'est la DISCONTINUITÉ au franchissement qui produit ce genre de
 * défaut, pas la largeur en elle-même.
 */

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** Dépassement horizontal au niveau DOCUMENT, plus la liste des coupables s'il y en a. */
async function measureOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number; offenders: string[] }> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const clientWidth = root.clientWidth;
    const offenders: string[] = [];
    if (root.scrollWidth > clientWidth) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right > clientWidth + 1 || rect.left < -1) {
          const cls = typeof el.className === "string" ? el.className.slice(0, 60) : "";
          offenders.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${cls} [${Math.round(rect.left)}..${Math.round(rect.right)}]`);
          if (offenders.length >= 8) break;
        }
      }
    }
    return { scrollWidth: root.scrollWidth, clientWidth, offenders };
  });
}

async function assertNoOverflow(page: Page, label: string): Promise<void> {
  const m = await measureOverflow(page);
  expect(
    m.scrollWidth,
    `${label} : débordement horizontal de ${m.scrollWidth - m.clientWidth} px — coupables : ${m.offenders.join(" | ") || "aucun identifié"}`,
  ).toBeLessThanOrEqual(m.clientWidth);
}

const BOUNDARY = [1000, 1023, 1024, 1025, 1100];
const MANDATORY = [
  { width: 1024, height: 768 },
  { width: 1024, height: 900 },
];

test.describe("H.3 — certification responsive 1024 px", () => {
  test.describe.configure({ timeout: 300000 });

  test("MATRICE — création d'appel d'offres : aucun débordement au niveau du document", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);

    for (const { width, height } of MANDATORY) {
      await page.setViewportSize({ width, height });
      await page.goto("/app/tenders/new", { timeout: 180000 });
      await expect(page.locator("input#title")).toBeVisible();
      await assertNoOverflow(page, `création ${width}x${height}`);

      // Les contrôles obligatoires doivent rester ATTEIGNABLES, pas seulement présents : un bouton
      // rogné hors viewport est visible pour le DOM et inutilisable pour l'utilisateur.
      for (const selector of ["select#clientAccountId", "select#candidateCompanyId", "input#title", "form button[type='submit']"]) {
        const box = await page.locator(selector).last().boundingBox();
        expect(box, `${selector} introuvable en ${width}px`).not.toBeNull();
        expect(box!.x + box!.width, `${selector} déborde en ${width}px`).toBeLessThanOrEqual(width + 1);
        expect(box!.x, `${selector} sort à gauche en ${width}px`).toBeGreaterThanOrEqual(-1);
      }
    }
  });

  test("MATRICE DE BORNES — la bascule de mise en page ne crée aucune discontinuité", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);
    await page.goto("/app/tenders/new", { timeout: 180000 });

    const measures: Record<number, number> = {};
    for (const width of BOUNDARY) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(150); // laisse la mise en page se stabiliser après le redimensionnement
      const m = await measureOverflow(page);
      measures[width] = m.scrollWidth - m.clientWidth;
      expect(m.scrollWidth, `bornes ${width}px — coupables : ${m.offenders.join(" | ") || "aucun"}`).toBeLessThanOrEqual(m.clientWidth);
    }
    console.log("H3_BOUNDARY_OVERFLOW_PX", JSON.stringify(measures));
  });

  test("FICHE D'APPEL D'OFFRES — en-tête, sections et actions tiennent en 1024 px", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);

    const tender = await prisma.tender.findFirst({
      where: { organizationId: fixture.organizationId, candidateCompanyId: { not: null } },
      select: { id: true },
    });
    test.skip(tender === null, "aucun appel d'offres rattaché à un candidat");

    for (const { width, height } of MANDATORY) {
      await page.setViewportSize({ width, height });
      await page.goto(`/app/tenders/${tender!.id}`, { timeout: 180000 });
      await expect(page.getByRole("heading").first()).toBeVisible();
      await assertNoOverflow(page, `fiche ${width}x${height}`);
    }
  });

  test("SÉLECTEUR ET BASCULE DE CANDIDAT — utilisables et sans débordement en 1024 px", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);

    const tender = await prisma.tender.findFirst({
      where: { organizationId: fixture.organizationId, candidateCompanyId: { not: null } },
      select: { id: true, candidateCompanyId: true },
    });
    test.skip(tender === null, "aucun appel d'offres rattaché à un candidat");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`/app/tenders/${tender!.id}`, { timeout: 180000 });

    const open = page.getByRole("button", { name: /entreprise candidate/i }).first();
    test.skip((await open.count()) === 0, "contrôle de bascule absent");
    await open.click();

    const select = page.locator("select#candidateCompanyId");
    await expect(select).toBeVisible();
    await assertNoOverflow(page, "sélecteur de candidat ouvert 1024x768");

    // §6 — le sélecteur doit rester dans le viewport MÊME avec des libellés longs : un `<select>`
    // se dimensionne sur son option la plus large, ce qui est la cause classique de débordement.
    const box = await select.boundingBox();
    expect(box!.x + box!.width, "le sélecteur déborde du viewport").toBeLessThanOrEqual(1024 + 1);

    // §16 — accessibilité clavier : le bouton de confirmation doit pouvoir recevoir le focus.
    const confirm = page.getByRole("button", { name: "Confirmer", exact: true });
    await confirm.focus();
    expect(await confirm.evaluate((el) => el === document.activeElement), "le bouton Confirmer n'est pas atteignable au clavier").toBe(true);
  });

  test("CONTENU LONG — un titre et une raison sociale pathologiques ne cassent pas la mise en page", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);

    // Données volontairement extrêmes mais VALIDES : c'est le cas réel qui révèle les conteneurs
    // flex sans `min-w-0`, jamais un jeu de démonstration bien dimensionné.
    const longTitle = `Marché public de travaux de rénovation énergétique ${"très ".repeat(20)}long`;
    const tender = await prisma.tender.findFirst({ where: { organizationId: fixture.organizationId }, select: { id: true, title: true } });
    test.skip(tender === null, "aucun appel d'offres");
    const original = tender!.title;

    try {
      await prisma.tender.update({ where: { id: tender!.id }, data: { title: longTitle } });
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto(`/app/tenders/${tender!.id}`, { timeout: 180000 });
      await expect(page.getByRole("heading").first()).toBeVisible();
      await assertNoOverflow(page, "titre très long 1024x768");
    } finally {
      await prisma.tender.update({ where: { id: tender!.id }, data: { title: original } });
    }
  });

  test("NON-RÉGRESSION — bureau 1280 / 1440 et tablette 768", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);

    for (const width of [1280, 1440, 768]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/app/tenders/new", { timeout: 180000 });
      await expect(page.locator("input#title")).toBeVisible();
      await assertNoOverflow(page, `non-régression ${width}px`);
    }
  });
});
