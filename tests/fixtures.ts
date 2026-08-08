import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export type E2eOtherOrgFixture = { email: string; password: string; organizationId: string; userId: string; clientAccountId: string; tenderId: string };

/** `other` (V2 Sprint 1 §5) — seconde organisation isolée, réservée aux scénarios anti-IDOR
 *  (`multi-tenant-isolation.spec.ts`). `tenderWithAnalysisId` (V2 Sprint 5) — second Tender de la
 *  même organisation principale, avec une analyse IA du DCE déjà réussie (seedée directement, sans
 *  clé API IA réelle), réservé au scénario Niveau 2 GO/NO-GO. Champs additifs : n'affectent aucun
 *  test préexistant. */
export type E2eFixture = E2eOtherOrgFixture & {
  tenderWithAnalysisId: string;
  other: E2eOtherOrgFixture;
  /** V2 Sprint 7 — second membre réel de la MÊME organisation, avec un accès client réel
   *  (CONTRIBUTOR), utilisé par les preuves E2E de collaboration Workspace. */
  collaboratorEmail: string;
  collaboratorPassword: string;
  collaboratorUserId: string;
  /** V2 Sprint 7 — Tender d'un second CLIENT de la MÊME organisation, sur lequel `collaborator` n'a
   *  AUCUNE affectation — preuve E2E de l'isolation same-org cross-client (mission §63). */
  tenderInOtherClientId: string;
  /** V2 Sprint 8 — `clientAccountId` de ce même second client (même motif que `tenderInOtherClientId`
   *  ci-dessus), nécessaire à la preuve Knowledge Base : les entrées y sont scopées directement par
   *  `clientAccountId`, jamais par un `tenderId`. */
  otherClientAccountId: string;
};

/** Correctif audit Codex P2-003 — relit les identifiants réellement créés en base par
 *  `tests/global-setup.ts` (jamais une valeur en dur). */
export function readFixture(): E2eFixture {
  const raw = readFileSync(path.resolve(__dirname, ".e2e-fixture.json"), "utf8");
  return JSON.parse(raw) as E2eFixture;
}

/** Connexion réelle via le formulaire (jamais un cookie injecté directement) — preuve que le
 *  flux d'authentification HTTP + redirection fonctionne réellement pour chaque test. Accepte
 *  aussi bien le fixture principal que `fixture.other` (même forme minimale email/password). */
export async function login(page: Page, fixture: Pick<E2eOtherOrgFixture, "email" | "password">): Promise<void> {
  await page.goto("/app/login");
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Mot de passe").fill(fixture.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/app/tenders");
}
