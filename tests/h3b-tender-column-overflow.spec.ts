import { expect, test, type Page } from "@playwright/test";
import { ensureLoggedIn, readFixture } from "./fixtures";

/**
 * H.3-b — DÉBORDEMENT INTRA-COLONNE sur la fiche d'appel d'offres.
 *
 * Pourquoi une seconde mesure alors que H.3 certifiait déjà cet écran : H.3 comparait
 * `documentElement.scrollWidth` à `clientWidth`. Cette mesure est structurellement AVEUGLE au défaut
 * traité ici. La fiche est bâtie sur `md:grid-cols-2`, dont les pistes valent `minmax(0, 1fr)` :
 * leur largeur est plafonnée, elles ne s'élargissent jamais. Un formulaire trop large pour la
 * colonne de GAUCHE déborde donc vers la droite — c'est-à-dire DANS la colonne de droite, et non
 * hors du document. Le total reste inchangé, `scrollWidth` ne bouge pas, et le contrôle passe au
 * vert pendant que le bouton « Ajouter » disparaît sous la section voisine.
 *
 * La mesure correcte est locale : chaque descendant doit tenir dans le rectangle de SA colonne.
 */

/** Éléments dont le rectangle sort de la colonne de grille qui les contient. */
async function measureColumnOverflow(page: Page): Promise<{ column: string; offender: string; overflowPx: number }[]> {
  return page.evaluate(() => {
    const results: { column: string; offender: string; overflowPx: number }[] = [];

    // Les colonnes sont les enfants directs des grilles multi-colonnes réellement appliquées à cette
    // largeur — on lit la valeur CALCULÉE, jamais la classe : à 800 px `md:grid-cols-2` ne
    // s'applique pas, et une colonne unique ne peut pas déborder sur sa voisine.
    const grids = Array.from(document.querySelectorAll<HTMLElement>("div")).filter((el) => {
      const style = getComputedStyle(el);
      return style.display === "grid" && style.gridTemplateColumns.split(" ").length > 1;
    });

    for (const grid of grids) {
      for (const column of Array.from(grid.children) as HTMLElement[]) {
        const colRect = column.getBoundingClientRect();
        if (colRect.width === 0) continue;
        const label = `${column.tagName.toLowerCase()}.${(typeof column.className === "string" ? column.className : "").slice(0, 40)}`;

        for (const el of Array.from(column.querySelectorAll<HTMLElement>("*"))) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const overflowPx = Math.round(rect.right - colRect.right);
          if (overflowPx > 1) {
            const cls = typeof el.className === "string" ? el.className.slice(0, 45) : "";
            const text = (el.textContent ?? "").trim().slice(0, 24);
            results.push({
              column: label,
              offender: `${el.tagName.toLowerCase()}[${el.getAttribute("name") ?? text}].${cls}`,
              overflowPx,
            });
          }
        }
      }
    }
    return results;
  });
}

/**
 * Un contrôle rogné est visible pour le DOM et inutilisable pour l'utilisateur. On vérifie donc que
 * chaque champ est réellement ATTEIGNABLE : c'est bien lui qui reçoit le clic à son propre centre.
 *
 * `elementFromPoint` ne raisonne que dans le VIEWPORT : sans amener l'élément à l'écran, il renvoie
 * `null` pour tout ce qui est sous la ligne de flottaison. Une première version de cette sonde a
 * ainsi signalé 52 contrôles « recouverts par rien » — un défaut de la mesure, pas du produit. On
 * fait donc défiler jusqu'à chaque contrôle avant de le tester, et on ignore ceux qui restent hors
 * cadre malgré cela.
 */
async function findUnreachableControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const unreachable: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("form input, form select, form button"))) {
      if (el.getBoundingClientRect().width === 0) continue;

      // Un `<details>` REPLIÉ ne peint pas son contenu, mais Chromium continue de rendre un
      // rectangle non nul pour ses descendants. `elementFromPoint` renvoie alors la section
      // réellement peinte à cet endroit, et la sonde crie au recouvrement sur un panneau
      // simplement fermé. Le panneau « modifier » de la fiche tombait exactement là.
      const details = el.closest("details");
      if (details !== null && !details.open) continue;

      el.scrollIntoView({ block: "center", inline: "nearest" });
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue;

      const hit = document.elementFromPoint(cx, cy);
      if (hit === null || hit === el || el.contains(hit) || hit.contains(el)) continue;
      // Champ fichier du design system (`FileInput`) : l'input natif est volontairement masqué
      // (`sr-only`) DANS son `<label>`, et c'est le label visible qui reçoit le clic — cliquer un
      // label active son champ. Recouvert par son propre label n'est donc pas inatteignable.
      const ownLabel = el.closest("label");
      if (ownLabel !== null && ownLabel.contains(hit)) continue;
      const label = el.getAttribute("name") ?? (el.textContent ?? "").trim().slice(0, 24);
      unreachable.push(`${el.tagName.toLowerCase()}[${label}] recouvert par <${hit.tagName.toLowerCase()}>`);
    }
    return unreachable;
  });
}

/**
 * Bouton ISOLÉ : dans un formulaire EN LIGNE (flex horizontal qui passe à la ligne), un bouton qui a
 * glissé seul sur une ligne à lui, sous des champs qui partagent une même ligne. C'est le symptôme
 * d'une rangée trop large pour sa colonne : le bouton « Ajouter » se retrouve orphelin, loin des
 * champs qu'il valide.
 *
 * Un formulaire EMPILÉ (`flex-col`, ou flex qui ne passe pas à la ligne) n'est pas concerné : un
 * bouton seul sous des champs empilés y est la mise en page voulue, pas un accident de largeur.
 */
async function findLonelyButtons(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const lonely: string[] = [];
    for (const form of Array.from(document.querySelectorAll<HTMLFormElement>("form"))) {
      const style = getComputedStyle(form);
      const inline = style.display === "flex" && style.flexDirection === "row" && style.flexWrap === "wrap";
      if (!inline) continue;
      const details = form.closest("details");
      if (details !== null && !details.open) continue;

      // Les messages d'erreur (role=alert) occupent une ligne à part par conception : ils ne comptent pas.
      const items = (Array.from(form.children) as HTMLElement[]).filter((child) => {
        const rect = child.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && child.getAttribute("role") !== "alert" && child.tagName !== "INPUT";
      });
      if (items.length < 2) continue;

      // Même ligne = bandes verticales qui se CHEVAUCHENT, jamais un `top` identique : `items-end`
      // aligne le bas des éléments, un bouton plus bas qu'un champ a donc un `top` différent tout en
      // partageant sa ligne. (Une première version groupait par `top` et signalait à tort 6 boutons.)
      const overlaps = (a: DOMRect, b: DOMRect) => a.top < b.bottom - 1 && b.top < a.bottom - 1;
      const fields = items.filter((el) => el.tagName !== "BUTTON");
      for (const button of items.filter((el) => el.tagName === "BUTTON")) {
        const rect = button.getBoundingClientRect();
        if (fields.some((field) => overlaps(field.getBoundingClientRect(), rect))) continue;
        if (fields.length === 0) continue;
        lonely.push(
          `« ${(button.textContent ?? "").trim().slice(0, 30)} » seul sur sa ligne (${Math.round(form.getBoundingClientRect().width)}px de large)`,
        );
      }
    }
    return lonely;
  });
}

/** 1024 = point certifié en H.3 ; 1512 = la largeur de la capture utilisateur ; 1280, 1366, 1440 =
 *  usages courants. Les passages à la ligne dépendent de la largeur exacte (W4 : « Ajouter » ne
 *  tombait seul qu'à 1512 px) : quelques largeurs intermédiaires valent mieux qu'un seul point. */
const WIDTHS = [1024, 1280, 1366, 1440, 1512];

test.describe("H.3-b — la fiche d'appel d'offres ne déborde pas colonne sur colonne", () => {
  test.describe.configure({ timeout: 300000 });

  for (const width of WIDTHS) {
    test(`aucun contrôle ne sort de sa colonne en ${width}px`, async ({ page }) => {
      const fixture = readFixture();
      await ensureLoggedIn(page, fixture);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/app/tenders/${fixture.tenderId}`, { timeout: 180000 });
      await expect(page.getByRole("heading").first()).toBeVisible();
      await page.waitForTimeout(400); // laisse les sections client se monter avant de mesurer

      const overflows = await measureColumnOverflow(page);
      const unreachable = await findUnreachableControls(page);
      const lonely = await findLonelyButtons(page);
      console.log(`H3B_${width}_OVERFLOW`, JSON.stringify(overflows, null, 1));
      console.log(`H3B_${width}_UNREACHABLE`, JSON.stringify(unreachable, null, 1));
      console.log(`H3B_${width}_LONELY`, JSON.stringify(lonely, null, 1));

      expect(
        overflows,
        `${width}px — ${overflows.length} élément(s) sortent de leur colonne : ${overflows
          .map((o) => `${o.offender} (+${o.overflowPx}px)`)
          .join(" | ")}`,
      ).toEqual([]);

      expect(unreachable, `${width}px — contrôles recouverts : ${unreachable.join(" | ")}`).toEqual([]);
      expect(lonely, `${width}px — boutons isolés : ${lonely.join(" | ")}`).toEqual([]);
    });
  }
});
