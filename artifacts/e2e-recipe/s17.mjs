import { readFileSync, writeFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const H = { Authorization: `Bearer ${o.users.OWNER_A.token}`, "X-Organization-Id": o.orgs.A.id, "Content-Type": "application/json" };
const call = async (path, { method = "GET", body } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const T = o.tenderMono;
const cr = await call(`/tenders/${T}/response-packages`, { method: "POST", body: {} });
console.log("creation package ->", cr.status, JSON.stringify(cr.body).slice(0, 220));
const pkgId = cr.body?.id;
if (pkgId) {
  o.packageId = pkgId; writeFileSync("artifacts/e2e-recipe/dataset.json", JSON.stringify(o, null, 2));
  const routes = await fetch(`${API}/api/v1/response-packages/${pkgId}`, { headers: H });
  console.log("detail package   ->", routes.status, (await routes.text()).slice(0, 260));
}
