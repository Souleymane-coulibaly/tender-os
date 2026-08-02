import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export type E2eFixture = { email: string; password: string; organizationId: string; userId: string; clientAccountId: string; tenderId: string };

/** Correctif audit Codex P2-003 — relit les identifiants réellement créés en base par
 *  `tests/global-setup.ts` (jamais une valeur en dur). */
export function readFixture(): E2eFixture {
  const raw = readFileSync(path.resolve(__dirname, ".e2e-fixture.json"), "utf8");
  return JSON.parse(raw) as E2eFixture;
}

/** Connexion réelle via le formulaire (jamais un cookie injecté directement) — preuve que le
 *  flux d'authentification HTTP + redirection fonctionne réellement pour chaque test. */
export async function login(page: Page, fixture: E2eFixture): Promise<void> {
  await page.goto("/app/login");
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Mot de passe").fill(fixture.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/app/tenders");
}
