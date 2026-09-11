import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";

export type E2eOtherOrgFixture = {
  email: string;
  password: string;
  organizationId: string;
  userId: string;
  clientAccountId: string;
  tenderId: string;
  /** Checkpoint CCV2-F.1 — entreprise candidate propre a CETTE organisation (cible d'isolation). */
  candidateCompanyId: string;
};

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
  /** Checkpoint CCV2-F.1 — SECONDE entreprise candidate de la MEME organisation (gap F3 : le
   *  changement de candidat ne se prouve qu'avec deux fiches aux donnees distinctes). */
  secondCandidateCompanyId: string;
  /** Checkpoint CCV2-G.1 — Tender HISTORIQUE sans entreprise candidate (transition explicite). */
  legacyTenderId: string;
  /** Organisation ABONNÉE dédiée au parcours DCE du Cockpit : initialiser/importer le DCE exige un
   *  droit actif, que l'organisation principale n'a volontairement pas. */
  cockpit: E2eOtherOrgFixture;
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

/**
 * Checkpoint TENDEROS-2.1-CCV2-F.2 — connexion RÉUTILISÉE, jamais répétée inutilement.
 *
 * Le throttler `auth` du produit (`IdentityModule` : 10 requêtes / 60 s) est une garde RÉELLE, et
 * elle n'est ni désactivée ni assouplie ici. Une suite qui se connecte à chaque scénario finit par
 * la déclencher et échoue sur un vrai 429 sans rapport avec ce qu'elle vérifie — un faux négatif.
 *
 * Le cache est aussi écrit SUR DISQUE : Playwright redémarre le worker après chaque échec, ce qui
 * vide les caches mémoire et relance une vague de connexions.
 *
 * Cela n'affaiblit aucune preuve : le cookie identifie l'UTILISATEUR, jamais son rôle. Le rôle est
 * relu en base par l'API à chaque requête, donc un changement de rôle entre deux scénarios prend
 * bien effet malgré la session réutilisée.
 */
type StoredSession = Awaited<ReturnType<BrowserContext["storageState"]>>;

const sessionsByEmail = new Map<string, StoredSession>();

function sessionCachePath(email: string): string {
  const digest = createHash("sha256").update(email).digest("hex").slice(0, 16);
  return path.resolve(__dirname, "..", "test-results", `.session-${digest}.json`);
}

export async function ensureLoggedIn(page: Page, identity: Pick<E2eOtherOrgFixture, "email" | "password">): Promise<void> {
  const cached = sessionsByEmail.get(identity.email);
  if (cached) {
    await page.context().addCookies(cached.cookies);
    return;
  }

  const diskPath = sessionCachePath(identity.email);
  if (existsSync(diskPath)) {
    const fromDisk = JSON.parse(readFileSync(diskPath, "utf8")) as StoredSession;
    await page.context().addCookies(fromDisk.cookies);
    // On VERIFIE que la session rejouée est valide plutôt que de le supposer : une session expirée
    // renverrait vers /app/login et ferait échouer le scénario sur un symptôme trompeur.
    await page.goto("/app/tenders");
    if (!page.url().includes("/app/login")) {
      sessionsByEmail.set(identity.email, fromDisk);
      return;
    }
    await page.context().clearCookies();
  }

  await login(page, identity);
  const state = await page.context().storageState();
  sessionsByEmail.set(identity.email, state);
  mkdirSync(path.dirname(diskPath), { recursive: true });
  writeFileSync(diskPath, JSON.stringify(state), "utf8");
}
