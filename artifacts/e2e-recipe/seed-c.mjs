/** Recette E2E §2 (fin) — membres/roles, clients A1-A2, entreprises candidates. API reelle. */
import { readFileSync, writeFileSync } from "node:fs";
const API = "http://localhost:4000";
const out = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const A = out.orgs.A.id, B = out.orgs.B.id, ownerA = out.users.OWNER_A.token, ownerB = out.users.OWNER_B.token;

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

// --- Membres de l'Org A avec leurs roles reels
out.memberships = {};
for (const [label, role] of [["ORG_ADMIN_A", "ORGANIZATION_ADMIN"], ["BID_MANAGER_A", "BID_MANAGER"], ["CONTRIBUTOR_A", "CONTRIBUTOR"], ["EXTERNAL_CONSULTANT_A", "EXTERNAL_CONSULTANT"]]) {
  const r = await call("/organization-memberships", { method: "POST", token: ownerA, orgId: A, body: { userId: out.users[label].id, role } });
  out.memberships[label] = { status: r.status, id: r.body?.id, role };
  console.log(`membership ${label} (${role}):`, r.status, r.status >= 400 ? JSON.stringify(r.body).slice(0, 140) : "");
}

// --- Clients A1 / A2
for (const [key, name] of [["A1", "Recette Client A1"], ["A2", "Recette Client A2"]]) {
  const r = await call("/clients", { method: "POST", token: ownerA, orgId: A, body: { name: `${name} ${out.stamp}` } });
  out.clients[key] = { status: r.status, id: r.body?.id };
  console.log(`client ${key}:`, r.status, out.clients[key].id ?? JSON.stringify(r.body).slice(0, 140));
}
// --- Client Org B (pour l'isolation tenant §25)
const cb = await call("/clients", { method: "POST", token: ownerB, orgId: B, body: { name: `Recette Client B1 ${out.stamp}` } });
out.clients.B1 = { status: cb.status, id: cb.body?.id };
console.log("client B1:", cb.status, out.clients.B1.id ?? JSON.stringify(cb.body).slice(0, 140));

// --- Entreprises candidates
for (const [key, token, org, name] of [["A", ownerA, A, "Recette Candidate A"], ["B", ownerB, B, "Recette Candidate B"]]) {
  const r = await call("/candidate-companies", { method: "POST", token, orgId: org, body: { name: `${name} ${out.stamp}` } });
  out.candidates[key] = { status: r.status, id: r.body?.id };
  console.log(`candidate ${key}:`, r.status, out.candidates[key].id ?? JSON.stringify(r.body).slice(0, 180));
}
writeFileSync("artifacts/e2e-recipe/dataset.json", JSON.stringify(out, null, 2));
