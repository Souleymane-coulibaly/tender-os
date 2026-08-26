import { readFileSync, writeFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const call = async (path, { method = "GET", body, token = o.users.OWNER_A.token, org = o.orgs.A.id } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Organization-Id": org }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const create = await call("/market-watch/saved-searches", { method: "POST", body: { name: `Recette veille ${o.stamp}` } });
console.log("creation veille ->", create.status, create.body?.id ?? JSON.stringify(create.body).slice(0, 200));
const id = create.body?.id;
if (id) {
  o.savedSearchId = id; writeFileSync("artifacts/e2e-recipe/dataset.json", JSON.stringify(o, null, 2));
  const t0 = Date.now();
  const run = await call(`/market-watch/saved-searches/${id}/run-now`, { method: "POST" });
  console.log(`run-now -> ${run.status} en ${Math.round((Date.now()-t0)/1000)}s |`, JSON.stringify(run.body).slice(0, 200));
  const m = await call(`/market-watch/saved-searches/${id}/matches?limit=5`);
  console.log("matches ->", m.status, "| total retourne:", (m.body?.items ?? []).length);
  for (const it of (m.body?.items ?? []).slice(0, 3)) console.log("   -", (it.tender?.title ?? "").slice(0, 70), "| source:", it.tender?.source, "| score:", it.match?.score);
}
