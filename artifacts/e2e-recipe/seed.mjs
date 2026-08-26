/** Recette E2E §2 — jeu de donnees isole cree via l'API REELLE. Prefixe `recette-` partout. */
import { writeFileSync } from "node:fs";
const API = "http://localhost:4000";
const PASSWORD = "RecetteE2E#2026";
const stamp = Date.now();
const out = { stamp, users: {}, orgs: {}, clients: {}, candidates: {}, log: [] };

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

async function register(label) {
  const email = `recette-${label.toLowerCase()}-${stamp}@recette.test`;
  const r = await call("/auth/register", { method: "POST", body: { email, password: PASSWORD, displayName: `Recette ${label}`, termsAccepted: true } });
  const l = await call("/auth/login", { method: "POST", body: { email, password: PASSWORD } });
  out.users[label] = { email, id: r.body?.id, token: l.body?.accessToken };
  return out.users[label];
}

// --- Acteurs
for (const label of ["OWNER_A", "ORG_ADMIN_A", "BID_MANAGER_A", "CONTRIBUTOR_A", "EXTERNAL_CONSULTANT_A", "OWNER_B"]) await register(label);
console.log("acteurs crees:", Object.keys(out.users).join(", "));

// --- Organisations (parcours d'onboarding officiel)
const orgA = await call("/organizations", { method: "POST", token: out.users.OWNER_A.token,
  body: { name: `Recette Org A ${stamp}`, slug: `recette-org-a-${stamp}`, countryCode: "FR", defaultTimezone: "Europe/Paris" } });
const orgB = await call("/organizations", { method: "POST", token: out.users.OWNER_B.token,
  body: { name: `Recette Org B ${stamp}`, slug: `recette-org-b-${stamp}`, countryCode: "FR", defaultTimezone: "Europe/Paris" } });
out.orgs.A = { status: orgA.status, id: orgA.body?.id };
out.orgs.B = { status: orgB.status, id: orgB.body?.id };
console.log("ORG A:", orgA.status, out.orgs.A.id ?? JSON.stringify(orgA.body).slice(0, 200));
console.log("ORG B:", orgB.status, out.orgs.B.id ?? JSON.stringify(orgB.body).slice(0, 200));

writeFileSync("artifacts/e2e-recipe/dataset.json", JSON.stringify(out, null, 2));
