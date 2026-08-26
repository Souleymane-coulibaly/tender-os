import { readFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const H = { Authorization: `Bearer ${o.users.OWNER_A.token}`, "X-Organization-Id": o.orgs.A.id, "Content-Type": "application/json" };
const call = async (path, { method = "GET", body } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
// §18 — modifier une donnee critique : l'entreprise candidate
const upd = await call(`/candidate-companies/${o.candidates.A.id}`, { method: "PATCH", body: { legalName: "Recette Candidate A - RAISON MODIFIEE" } });
console.log("maj candidate ->", upd.status, JSON.stringify(upd.body).slice(0, 130));
const fresh = await call(`/response-packages/${o.packageId}/freshness`);
console.log("fraicheur     ->", fresh.status, JSON.stringify(fresh.body).slice(0, 200));
// §21 — solde de credits AO AVANT depot
const before = await call("/billing/entitlements");
console.log("entitlements  ->", before.status, JSON.stringify(before.body).slice(0, 200));
const creditsBefore = await call("/billing/ao-credits");
console.log("credits avant ->", creditsBefore.status, JSON.stringify(creditsBefore.body).slice(0, 160));
// §20 — depot
const sub = await call(`/tenders/${o.tenderMono}/submissions`, { method: "POST", body: { responsePackageVersionId: o.packageVersionId } });
console.log("depot         ->", sub.status, JSON.stringify(sub.body).slice(0, 240));
const creditsAfter = await call("/billing/ao-credits");
console.log("credits apres ->", creditsAfter.status, JSON.stringify(creditsAfter.body).slice(0, 160));
