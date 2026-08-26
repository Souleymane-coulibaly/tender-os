import { readFileSync, writeFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const call = async (path, { method = "GET", body, token = o.users.OWNER_A.token, org = o.orgs.A.id } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Organization-Id": org }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
// Tender mono-lot
const t1 = await call("/tenders", { method: "POST", body: { title: `Recette Tender mono ${o.stamp}`, clientAccountId: o.clients.A1.id, candidateCompanyId: o.candidates.A.id, submissionDeadline: new Date(Date.now() + 20*864e5).toISOString() } });
console.log("tender mono-lot ->", t1.status, t1.body?.id ?? JSON.stringify(t1.body).slice(0, 220));
// Tender multi-lot
const t2 = await call("/tenders", { method: "POST", body: { title: `Recette Tender multi ${o.stamp}`, clientAccountId: o.clients.A1.id, candidateCompanyId: o.candidates.A.id, submissionDeadline: new Date(Date.now() + 30*864e5).toISOString() } });
console.log("tender multi-lot->", t2.status, t2.body?.id ?? "");
o.tenderMono = t1.body?.id; o.tenderMulti = t2.body?.id;
if (o.tenderMulti) {
  for (const n of ["Lot 1 - Travaux", "Lot 2 - Maintenance"]) {
    const l = await call(`/tenders/${o.tenderMulti}/lots`, { method: "POST", body: { name: n } });
    console.log(`  lot "${n}" ->`, l.status, l.status >= 400 ? JSON.stringify(l.body).slice(0, 160) : l.body?.id);
  }
}
// GO/NO-GO au niveau TENDER -> le Dashboard doit alors le refleter
if (o.tenderMono) {
  const g = await call(`/tenders/${o.tenderMono}/go-no-go/decisions`, { method: "POST", body: { decision: "GO", justification: "Recette E2E niveau tender." } });
  console.log("GO tender       ->", g.status, JSON.stringify(g.body).slice(0, 160));
}
const d = await call("/dashboard");
console.log("dashboard       -> goNoGo:", JSON.stringify(d.body?.goNoGo), "| activeTenders:", d.body?.kpis?.activeTenders, "| pipeline:", JSON.stringify(d.body?.pipeline));
writeFileSync("artifacts/e2e-recipe/dataset.json", JSON.stringify(o, null, 2));
