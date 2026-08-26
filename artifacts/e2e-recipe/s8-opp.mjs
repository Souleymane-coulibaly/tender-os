import { readFileSync, writeFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const call = async (path, { method = "GET", body, token = o.users.OWNER_A.token, org = o.orgs.A.id } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Organization-Id": org }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
// §8 — promotion d'une opportunite issue de la veille
const m = await call(`/market-watch/saved-searches/${o.savedSearchId}/matches?limit=1`);
const ext = m.body?.items?.[0]?.tender;
console.log("opportunite veille :", (ext?.title ?? "").slice(0, 60), "| source:", ext?.source);
const promo = await call(`/market-watch/external-tenders/${ext?.id}/promote`, { method: "POST", body: { clientAccountId: o.clients.A1.id } });
console.log("promotion          ->", promo.status, JSON.stringify(promo.body).slice(0, 200));

// Parcours Opportunity natif
const opp = await call("/opportunities", { method: "POST", body: { title: `Recette Opportunite ${o.stamp}`, clientAccountId: o.clients.A1.id } });
console.log("creation opp       ->", opp.status, opp.body?.id ?? JSON.stringify(opp.body).slice(0, 200));
if (opp.body?.id) {
  o.opportunityId = opp.body.id; writeFileSync("artifacts/e2e-recipe/dataset.json", JSON.stringify(o, null, 2));
  const qs = await call(`/opportunities/${opp.body.id}/quick-score`, { method: "POST", body: {} });
  console.log("quick-score        ->", qs.status, JSON.stringify(qs.body).slice(0, 160));
  const go = await call(`/opportunities/${opp.body.id}/go-no-go-decisions`, { method: "POST", body: { decision: "GO", rationale: "Recette E2E : capacite technique confirmee et planning compatible." } });
  console.log("decision GO        ->", go.status, JSON.stringify(go.body).slice(0, 200));
  const hist = await call(`/opportunities/${opp.body.id}/go-no-go-decisions`);
  console.log("historique GO/NOGO ->", hist.status, "| entrees:", (hist.body?.items ?? hist.body ?? []).length);
}
