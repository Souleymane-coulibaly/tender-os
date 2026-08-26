import { readFileSync } from "node:fs";
const API = "http://localhost:4000";
const out = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const A = out.orgs.A.id, t = out.users.OWNER_A.token;
async function call(path, opt = {}) {
  const h = { "Content-Type": "application/json", Authorization: `Bearer ${t}`, "X-Organization-Id": A };
  const res = await fetch(`${API}/api/v1${path}`, { ...opt, headers: h });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { j = txt; }
  return { status: res.status, body: j };
}
for (const p of ["/billing", "/billing/plan-catalog", "/billing/subscription", "/billing/entitlements", "/billing/usage", "/me"]) {
  const r = await call(p);
  console.log(`${String(r.status).padEnd(4)} ${p.padEnd(26)}`, JSON.stringify(r.body).slice(0, 220));
}
