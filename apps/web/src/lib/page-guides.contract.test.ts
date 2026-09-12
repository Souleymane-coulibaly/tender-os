// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PAGE_GUIDE_KEY_PATTERN,
  PAGE_GUIDE_MAX_STEPS,
  PAGE_GUIDES,
  type PageGuideKey,
} from "./page-guides";

/**
 * Contrat des guides de page : chaque étape vise un élément RÉEL (`data-tour` écrit en clair dans
 * une source de l'application connectée) et chaque page déclare son guide via `guideKey` sur son
 * `PageHeader`. Lu depuis les sources plutôt que par rendu : une cible posée dans une branche
 * rarement affichée (liste non vide, rôle précis) resterait invisible à un test de composant.
 */
const PROTECTED = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "app", "(protected)");

const TITLE_MAX_LENGTH = 40;
const BODY_MAX_LENGTH = 180;

/** Fichier (relatif à `(protected)`) qui doit passer `guideKey="<clé>"` à son `PageHeader` — la
 *  page elle-même, sauf le tableau de bord dont l'en-tête est `DashboardHeader`. */
const PAGE_FILES: Readonly<Record<PageGuideKey, string>> = {
  dashboard: "dashboard-header.tsx",
  "market-watch": "market-watch/page.tsx",
  opportunities: "opportunities/page.tsx",
  tenders: "tenders/page.tsx",
  "tender-overview": "tenders/[id]/page.tsx",
  knowledge: "knowledge/page.tsx",
  documents: "documents/page.tsx",
  clients: "clients/page.tsx",
  validations: "validations/page.tsx",
  // Lot B — onglets de la fiche AO.
  "tender-dce": "tenders/[id]/dce/page.tsx",
  "tender-analysis": "tenders/[id]/analysis/page.tsx",
  "tender-checklist": "tenders/[id]/checklist/page.tsx",
  "tender-collaboration": "tenders/[id]/workspace/page.tsx",
  "tender-assistant": "tenders/[id]/assistant/page.tsx",
  "tender-technical-memo": "tenders/[id]/technical-memo/page.tsx",
  "tender-administrative-dossier": "tenders/[id]/administrative-dossier/page.tsx",
  "tender-pricing-schedule": "tenders/[id]/pricing-schedule/page.tsx",
  "tender-pricing": "tenders/[id]/pricing/page.tsx",
  "tender-deliverables": "tenders/[id]/deliverables/page.tsx",
  "tender-generations": "tenders/[id]/generations/page.tsx",
  "tender-documents-generated": "tenders/[id]/documents-generated/page.tsx",
  "tender-validation": "tenders/[id]/validation/page.tsx",
  "tender-signature": "tenders/[id]/signature/page.tsx",
  "tender-submission-package": "tenders/[id]/submission-package/page.tsx",
  "tender-response-package": "tenders/[id]/response-package/page.tsx",
  "tender-submission": "tenders/[id]/submission/page.tsx",
  "tender-export": "tenders/[id]/export/page.tsx",
  // Lot C — ressources et paramètres (Intégrations / Configuration IA : en-tête dans le layout).
  subscription: "subscription/page.tsx",
  members: "members/page.tsx",
  integrations: "integrations/layout.tsx",
  "ai-configuration": "ai-configuration/layout.tsx",
  "ai-costs": "pricing/page.tsx",
  "candidate-companies": "candidate-companies/page.tsx",
  subcontractors: "subcontractor-profiles/page.tsx",
};

/** Sources des écrans réels : ni tests, ni fixtures de test (qui posent leurs propres `data-tour`
 *  factices et masqueraient une cible disparue de la vraie page). */
function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx") && !entry.includes("fixture"))
      files.push(path);
  }
  return files;
}

const guides = Object.entries(PAGE_GUIDES);
const allSteps = guides.flatMap(([, guide]) =>
  guide.steps.map((step) => ({ key: guide.key, ...step })),
);

describe("guides de page — contrat", () => {
  it("chaque clé respecte le format de l'API et correspond à son entrée", () => {
    expect(guides.length).toBe(Object.keys(PAGE_FILES).length);
    for (const [recordKey, guide] of guides) {
      expect(guide.key).toBe(recordKey);
      expect(PAGE_GUIDE_KEY_PATTERN.test(guide.key), guide.key).toBe(true);
      expect(guide.pageLabel.trim().length, guide.key).toBeGreaterThan(0);
    }
  });

  it(`chaque guide compte de 3 à ${PAGE_GUIDE_MAX_STEPS} étapes`, () => {
    for (const [, guide] of guides) {
      expect(guide.steps.length, guide.key).toBeGreaterThanOrEqual(3);
      expect(guide.steps.length, guide.key).toBeLessThanOrEqual(PAGE_GUIDE_MAX_STEPS);
    }
  });

  it("chaque cible est unique entre tous les guides et préfixée par `guide-<clé>-`", () => {
    const targets = allSteps.map((step) => step.target);
    expect(new Set(targets).size).toBe(targets.length);
    for (const step of allSteps)
      expect(step.target.startsWith(`guide-${step.key}-`), step.target).toBe(true);
  });

  it('chaque cible existe en clair (`data-tour="…"`) dans une source de l\'application connectée', () => {
    const sources = sourceFiles(PROTECTED).map((file) => readFileSync(file, "utf8"));
    expect(sources.length).toBeGreaterThan(100);
    const missing = allSteps
      .map((step) => step.target)
      .filter((target) => !sources.some((source) => source.includes(`data-tour="${target}"`)));
    expect(missing, "cibles sans élément réel").toEqual([]);
  });

  it("titres et textes restent courts, non vides et sans emoji", () => {
    const offenders: string[] = [];
    for (const step of allSteps) {
      if (step.title.trim().length === 0 || step.title.length > TITLE_MAX_LENGTH)
        offenders.push(`${step.target} — titre (${step.title.length})`);
      if (step.body.trim().length === 0 || step.body.length > BODY_MAX_LENGTH)
        offenders.push(`${step.target} — texte (${step.body.length})`);
      if (/\p{Extended_Pictographic}/u.test(step.title + step.body))
        offenders.push(`${step.target} — emoji`);
    }
    expect(offenders).toEqual([]);
  });

  it.each(Object.entries(PAGE_FILES))(
    "la page « %s » déclare son guide sur son PageHeader",
    (key, file) => {
      const source = readFileSync(join(PROTECTED, file), "utf8");
      expect(source.includes(`guideKey="${key}"`), relative(PROTECTED, join(PROTECTED, file))).toBe(
        true,
      );
    },
  );
});
