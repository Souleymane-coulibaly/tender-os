import { readFileSync, writeFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const H = { Authorization: `Bearer ${o.users.OWNER_A.token}`, "X-Organization-Id": o.orgs.A.id, "Content-Type": "application/json" };
const call = async (path, { method = "GET", body } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const P = o.packageId;
const build = await call(`/response-packages/${P}/build`, { method: "POST", body: {} });
console.log("build      ->", build.status, JSON.stringify(build.body).slice(0, 260));
const vId = build.body?.versionId ?? build.body?.version?.id ?? build.body?.id;
if (vId) {
  o.packageVersionId = vId; writeFileSync("artifacts/e2e-recipe/dataset.json", JSON.stringify(o, null, 2));
  const comp = await call(`/response-packages/${P}/versions/${vId}/completeness`);
  console.log("completude ->", comp.status, JSON.stringify(comp.body).slice(0, 320));
  const val = await call(`/response-packages/${P}/versions/${vId}/validate`, { method: "POST", body: {} });
  console.log("validation ->", val.status, JSON.stringify(val.body).slice(0, 240));
}
const fresh = await call(`/response-packages/${P}/freshness`);
console.log("fraicheur  ->", fresh.status, JSON.stringify(fresh.body).slice(0, 240));
