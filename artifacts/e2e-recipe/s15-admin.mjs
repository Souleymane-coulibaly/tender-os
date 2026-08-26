import { readFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const H = { Authorization: `Bearer ${o.users.OWNER_A.token}`, "X-Organization-Id": o.orgs.A.id, "Content-Type": "application/json" };
const call = async (path, { method = "GET", body } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const T = o.tenderMono;
const cap = await call(`/tenders/${T}/administrative-dossier/capabilities`);
console.log("capabilities ->", cap.status, JSON.stringify(cap.body).slice(0, 240));
for (const [label, ready, gen] of [
  ["DC1", `/tenders/${T}/official-forms/dc1/readiness`, `/tenders/${T}/administrative-dc1`],
  ["DC2", `/tenders/${T}/official-forms/dc2/candidate/readiness`, `/tenders/${T}/administrative-dc2`],
  ["ACTE/ATTRI1", null, `/tenders/${T}/administrative-engagement-act`],
]) {
  if (ready) { const r = await call(ready); console.log(`${label} readiness ->`, r.status, JSON.stringify(r.body).slice(0, 200)); }
  const g = await call(gen, { method: "POST", body: {} });
  console.log(`${label} generation->`, g.status, JSON.stringify(g.body).slice(0, 200));
}
