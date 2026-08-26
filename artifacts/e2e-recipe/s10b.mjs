import { readFileSync, writeFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const call = async (path, { method = "GET", body, token = o.users.OWNER_A.token, org = o.orgs.A.id } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Organization-Id": org }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
o.lots = [];
for (const [num, title] of [["1", "Travaux de renovation"], ["2", "Maintenance annuelle"]]) {
  const l = await call(`/tenders/${o.tenderMulti}/lots`, { method: "POST", body: { lotNumber: num, title } });
  console.log(`lot ${num} ->`, l.status, l.body?.id ?? JSON.stringify(l.body).slice(0, 150));
  if (l.body?.id) o.lots.push(l.body.id);
}
const detail = await call(`/tenders/${o.tenderMulti}`);
console.log("tender multi ->", detail.status, "| client:", !!detail.body?.clientAccountId, "| candidate:", !!detail.body?.candidateCompanyId, "| statut:", detail.body?.status, "| deadline:", (detail.body?.submissionDeadline ?? "").slice(0,10));
// §25 isolation : OWNER_B tente d'acceder au tender de l'org A
const cross = await call(`/tenders/${o.tenderMono}`, { token: o.users.OWNER_B.token, org: o.orgs.B.id });
console.log("OWNER_B -> tender A ->", cross.status, "(404 attendu)");
const crossHeader = await call(`/tenders/${o.tenderMono}`, { token: o.users.OWNER_B.token, org: o.orgs.A.id });
console.log("OWNER_B + header A  ->", crossHeader.status, "(404/403 attendu)");
writeFileSync("artifacts/e2e-recipe/dataset.json", JSON.stringify(o, null, 2));
