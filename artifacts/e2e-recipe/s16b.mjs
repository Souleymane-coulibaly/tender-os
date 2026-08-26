import { readFileSync, writeFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const H = { Authorization: `Bearer ${o.users.OWNER_A.token}`, "X-Organization-Id": o.orgs.A.id, "Content-Type": "application/json" };
const call = async (path, { method = "GET", body } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const cr = await call(`/tenders/${o.tenderMono}/pricing-schedules`, { method: "POST", body: { sourceDocumentId: o.dceDocumentId, financialDocumentTypeOverride: "BPU" } });
console.log("creation BPU ->", cr.status, JSON.stringify(cr.body).slice(0, 240));
if (cr.body?.id) {
  o.pricingScheduleId = cr.body.id; writeFileSync("artifacts/e2e-recipe/dataset.json", JSON.stringify(o, null, 2));
  const d = await call(`/pricing-schedules/${cr.body.id}`);
  console.log("detail       ->", d.status, "| type:", d.body?.financialDocumentType, "| versions:", (d.body?.versions ?? []).length);
}
