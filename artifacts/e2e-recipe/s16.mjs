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
const dossier = await call(`/tenders/${T}/administrative-dossier`, { method: "POST", body: {} });
console.log("creation dossier admin ->", dossier.status, JSON.stringify(dossier.body).slice(0, 160));
const dc1 = await call(`/tenders/${T}/administrative-dc1/generate-pdf`, { method: "POST", body: {} });
console.log("DC1 PDF apres dossier  ->", dc1.status, JSON.stringify(dc1.body).slice(0, 200));
console.log("\n=== §16 PRICING ===");
const list = await call(`/tenders/${T}/pricing-schedules`);
console.log("liste chiffrages ->", list.status, JSON.stringify(list.body).slice(0, 180));
const cr = await call(`/tenders/${T}/pricing-schedules`, { method: "POST", body: { kind: "BPU", title: "BPU recette E2E" } });
console.log("creation BPU     ->", cr.status, JSON.stringify(cr.body).slice(0, 220));
if (cr.body?.id) { o.pricingScheduleId = cr.body.id; writeFileSync("artifacts/e2e-recipe/dataset.json", JSON.stringify(o, null, 2)); }
