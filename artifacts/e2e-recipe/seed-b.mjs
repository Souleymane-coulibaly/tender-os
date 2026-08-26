/** Recette E2E §2 (suite) — cree OWNER_B et Org B APRES reset du bucket d'authentification.
 *  Le limiteur (10 req/60s, bucket partage register+login) avait refuse le 6e acteur : comportement
 *  produit CORRECT, seule la cadence du seeding etait fautive. */
import { readFileSync, writeFileSync } from "node:fs";
const API = "http://localhost:4000";
const PASSWORD = "RecetteE2E#2026";
const out = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));

async function call(path, { method = "GET", body, token, orgId } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (orgId) headers["X-Organization-Id"] = orgId;
  const res = await fetch(`${API}/api/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  out.log.push({ method, path, status: res.status });
  return { status: res.status, body: json };
}

console.log("attente du reset du bucket d'authentification (65 s)...");
await new Promise((r) => setTimeout(r, 65000));

const email = `recette-owner-b-${out.stamp}@recette.test`;
const r = await call("/auth/register", { method: "POST", body: { email, password: PASSWORD, displayName: "Recette OWNER_B", termsAccepted: true } });
const l = await call("/auth/login", { method: "POST", body: { email, password: PASSWORD } });
out.users.OWNER_B = { email, id: r.body?.id, token: l.body?.accessToken };
console.log("OWNER_B:", r.status, l.status, l.body?.accessToken ? "token OK" : "token ABSENT");

const orgB = await call("/organizations", { method: "POST", token: out.users.OWNER_B.token,
  body: { name: `Recette Org B ${out.stamp}`, slug: `recette-org-b-${out.stamp}`, countryCode: "FR", defaultTimezone: "Europe/Paris" } });
out.orgs.B = { status: orgB.status, id: orgB.body?.id };
console.log("ORG B:", orgB.status, out.orgs.B.id ?? JSON.stringify(orgB.body).slice(0, 160));
writeFileSync("artifacts/e2e-recipe/dataset.json", JSON.stringify(out, null, 2));
