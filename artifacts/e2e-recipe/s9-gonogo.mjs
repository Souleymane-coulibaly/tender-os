import { readFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const call = async (path, { method = "GET", body, token = o.users.OWNER_A.token, org = o.orgs.A.id } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Organization-Id": org }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const id = o.opportunityId;
for (const s of ["TO_QUALIFY", "QUALIFIED"]) {
  const r = await call(`/opportunities/${id}/status`, { method: "PATCH", body: { status: s } });
  console.log(`statut -> ${s.padEnd(11)}`, r.status, r.status >= 400 ? JSON.stringify(r.body).slice(0, 140) : "");
}
const go = await call(`/opportunities/${id}/go-no-go-decisions`, { method: "POST", body: { decision: "GO", justification: "Recette E2E : capacite technique confirmee, planning compatible." } });
console.log("decision GO      ->", go.status, JSON.stringify(go.body).slice(0, 180));
const hist = await call(`/opportunities/${id}/go-no-go-decisions`);
const items = hist.body?.items ?? hist.body ?? [];
console.log("historique       ->", hist.status, "| entrees:", items.length, "| decision:", items[0]?.decision, "| justification:", (items[0]?.justification ?? "").slice(0, 40));
// §9 RBAC : un CONTRIBUTOR peut-il decider ?
const asContrib = await call(`/opportunities/${id}/go-no-go-decisions`, { method: "POST", token: o.users.CONTRIBUTOR_A.token, body: { decision: "NO_GO", justification: "tentative non autorisee" } });
console.log("CONTRIBUTOR GO   ->", asContrib.status, "(refus attendu)", JSON.stringify(asContrib.body?.error?.code ?? ""));
// §9 projection Dashboard = SOT ?
const dash = await call("/dashboard");
console.log("dashboard        ->", JSON.stringify(dash.body?.goNoGo), "| goRate:", dash.body?.analytics?.goRate);
