import { readFileSync, writeFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const call = async (path, { method = "GET", body, token = o.users.OWNER_A.token, org = o.orgs.A.id } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Organization-Id": org }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const m = await call(`/market-watch/saved-searches/${o.savedSearchId}/matches?limit=1`);
const ext = m.body?.items?.[0]?.tender;
const promo = await call(`/market-watch/saved-searches/external-tenders/${ext?.id}/promote`, { method: "POST", body: { clientAccountId: o.clients.A1.id } });
console.log("promotion veille ->", promo.status, JSON.stringify(promo.body).slice(0, 180));
if (promo.body?.id) { o.promotedOpportunityId = promo.body.id; }

const go = await call(`/opportunities/${o.opportunityId}/go-no-go-decisions`, { method: "POST", body: { decision: "GO", justification: "Recette E2E : capacite technique confirmee, planning compatible." } });
console.log("decision GO      ->", go.status, JSON.stringify(go.body).slice(0, 200));
const hist = await call(`/opportunities/${o.opportunityId}/go-no-go-decisions`);
const items = hist.body?.items ?? hist.body ?? [];
console.log("historique       ->", hist.status, "| entrees:", items.length, "| derniere:", items[0]?.decision ?? "-");
const dash = await call("/dashboard");
console.log("dashboard GO/NOGO->", JSON.stringify(dash.body?.goNoGo), "| goRate:", dash.body?.analytics?.goRate);
writeFileSync("artifacts/e2e-recipe/dataset.json", JSON.stringify(o, null, 2));
