/** Preuve REC-002 — run-now reel sur BOAMP + TED, avec titres TED >300 caracteres. */
import { readFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const H = { Authorization: `Bearer ${o.users.OWNER_A.token}`, "X-Organization-Id": o.orgs.A.id, "Content-Type": "application/json" };
const call = async (p, { method = "GET", body } = {}) => {
  const r = await fetch(`${API}/api/v1${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j };
};
const nv = await call("/market-watch/saved-searches", { method: "POST", body: { name: `Preuve REC-002 ${Date.now()}` } });
console.log("veille creee ->", nv.status, nv.body?.id);
const t0 = Date.now();
const run = await call(`/market-watch/saved-searches/${nv.body.id}/run-now`, { method: "POST" });
console.log(`run-now      -> ${run.status} en ${Math.round((Date.now()-t0)/1000)}s |`, JSON.stringify(run.body).slice(0, 220));
const m = await call(`/market-watch/saved-searches/${nv.body.id}/matches?limit=100`);
const items = m.body?.items ?? [];
const bySource = items.reduce((a, i) => { const s = i.tender?.source ?? "?"; a[s] = (a[s] ?? 0) + 1; return a; }, {});
console.log("matches      ->", m.status, "| par source:", JSON.stringify(bySource));
