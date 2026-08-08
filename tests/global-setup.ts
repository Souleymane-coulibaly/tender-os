import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Correctif audit Codex P2-003 — exécute le seed e2e dédié (apps/api/prisma/e2e-seed.ts) contre la
 * base PostgreSQL locale déjà démarrée pour ce correctif, et écrit ses identifiants dans
 * `tests/.e2e-fixture.json`, relu par chaque spec. Aucune donnée fabriquée en mémoire : tout est
 * réellement créé en base avant que les tests ne s'exécutent.
 */
export default function globalSetup(): void {
  const apiDir = path.resolve(__dirname, "../apps/api");
  const output = execSync("pnpm exec tsx prisma/e2e-seed.ts", { cwd: apiDir, encoding: "utf8" });
  const lastLine = output.trim().split("\n").pop() ?? "{}";
  const fixture = JSON.parse(lastLine) as {
    email: string;
    password: string;
    organizationId: string;
    userId: string;
    clientAccountId: string;
    tenderId: string;
    tenderWithAnalysisId: string;
    collaboratorEmail: string;
    collaboratorPassword: string;
    collaboratorUserId: string;
    tenderInOtherClientId: string;
  };
  writeFileSync(path.resolve(__dirname, ".e2e-fixture.json"), JSON.stringify(fixture, null, 2));
}
