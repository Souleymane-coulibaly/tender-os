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

const MIGRATED = [
  "tenders/[id]",
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
];

/** Gris bruts (jetons : tenderos-navy / tenderos-slate / tenderos-light), noir brut des anciens
 *  boutons (Button variant="primary") et titre de page écrit à la main (PageHeader / Card). */
const LEGACY_PATTERNS: readonly { label: string; pattern: RegExp }[] = [
  { label: "gris brut", pattern: /\b(?:text|bg|border|ring|divide|placeholder|hover:bg|hover:text)-(?:neutral|gray|zinc|stone)-\d{2,3}\b/ },
  { label: "titre écrit à la main", pattern: /<h1 className="text-xl font-semibold/ },
];

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) files.push(path);
  }
  return files;
}

const migratedFiles = MIGRATED.flatMap((dir) => sourceFiles(join(PROTECTED, dir)));

describe("design system — pages migrées", () => {
  it("chaque dossier déclaré migré existe et contient des pages (garde-fou du test lui-même)", () => {
    for (const dir of MIGRATED) expect(existsSync(join(PROTECTED, dir)), dir).toBe(true);
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
            if (match) offenders.push(`${relative(PROTECTED, file)}:${index + 1} — ${label} : ${match[0]}`);
          }
        });
    }
    expect(offenders, "à remplacer par les jetons et composants de DESIGN_SYSTEM.md").toEqual([]);
  });
});
