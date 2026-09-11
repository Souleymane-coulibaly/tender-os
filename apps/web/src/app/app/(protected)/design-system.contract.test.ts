// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Garde-fou du design system (DESIGN_SYSTEM.md) : l'ancien style ne revient pas dans une page déjà
 * migrée. À chaque lot migré, ajouter ses dossiers à `MIGRATED`. Lu depuis les sources plutôt que
 * par rendu : un gris brut glissé dans une branche rarement affichée serait invisible à un test de
 * composant.
 */
const PROTECTED = fileURLToPath(new URL(".", import.meta.url));
/** `src/app` : racine des écrans hors application connectée (back-office, onboarding, connexion). */
const APP_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const MIGRATED_OUTSIDE_PROTECTED = [
  // Lot 4
  "platform-admin",
  "onboarding",
  "app/login",
  "app/forgot-password",
  "app/reset-password",
];

const MIGRATED = [
  "tenders",
  "candidate-companies",
  "members",
  "notifications",
  "subscription",
  "ai-configuration",
  "integrations",
  "pricing",
  // Lot 2
  "clients",
  "opportunities",
  "market-watch",
  // Lot 3 (dossiers, puis composants isolés de l'en-tête)
  "knowledge",
  "documents",
  "subcontractor-profiles",
  "validations",
  "me",
  "notification-bell.tsx",
  "restart-tour-button.tsx",
];

/** Gris bruts (jetons : tenderos-navy / tenderos-slate / tenderos-light), noir brut des anciens
 *  boutons (Button variant="primary") et titre de page écrit à la main (PageHeader / Card). */
const LEGACY_PATTERNS: readonly { label: string; pattern: RegExp }[] = [
  { label: "gris brut", pattern: /\b(?:text|bg|border|ring|divide|placeholder|hover:bg|hover:text)-(?:neutral|gray|zinc|stone)-\d{2,3}\b/ },
  { label: "titre écrit à la main", pattern: /<h1 className="text-xl font-semibold/ },
  // Jeton inventé : la palette `tenderos-*` n'a ni danger, ni success… (tailwind.config.ts). Tailwind
  // ignore la classe sans rien signaler — un message d'erreur s'affichait ainsi sans couleur.
  { label: "jeton inexistant", pattern: /\b(?:text|bg|border|ring|fill|stroke|divide|outline|placeholder)-tenderos-(?:danger|success|warning|info|error|red|green|amber|orange|yellow|purple|gray|grey|dark|primary|secondary|muted)\b/ },
  // Couleurs brutes : jetons d'état (success/warning/danger/info) ou `Alert` à la place.
  { label: "couleur brute", pattern: /\b(?:text|bg|border|ring|hover:bg|hover:text)-(?:green|red|amber|yellow|blue|emerald|orange|rose|sky|indigo|purple)-\d{2,3}\b/ },
];

function sourceFiles(dir: string): string[] {
  if (statSync(dir).isFile()) return dir.endsWith(".tsx") && !dir.endsWith(".test.tsx") ? [dir] : [];
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) files.push(path);
  }
  return files;
}

const migratedPaths = [
  ...MIGRATED.map((dir) => join(PROTECTED, dir)),
  ...MIGRATED_OUTSIDE_PROTECTED.map((dir) => join(APP_ROOT, dir)),
];
const migratedFiles = migratedPaths.flatMap((path) => sourceFiles(path));

describe("design system — pages migrées", () => {
  it("chaque dossier déclaré migré existe et contient des pages (garde-fou du test lui-même)", () => {
    for (const path of migratedPaths) expect(existsSync(path), relative(APP_ROOT, path)).toBe(true);
    expect(migratedFiles.length).toBeGreaterThan(100);
  });

  it("aucun gris brut ni titre écrit à la main ne revient dans une page migrée", () => {
    const offenders: string[] = [];
    for (const file of migratedFiles) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          for (const { label, pattern } of LEGACY_PATTERNS) {
            const match = pattern.exec(line);
            if (match) offenders.push(`${relative(APP_ROOT, file)}:${index + 1} — ${label} : ${match[0]}`);
          }
        });
    }
    expect(offenders, "à remplacer par les jetons et composants de DESIGN_SYSTEM.md").toEqual([]);
  });
});
