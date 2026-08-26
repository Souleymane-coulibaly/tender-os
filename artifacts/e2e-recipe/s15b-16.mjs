import { readFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const H = { Authorization: `Bearer ${o.users.OWNER_A.token}`, "X-Organization-Id": o.orgs.A.id, "Content-Type": "application/json" };
const call = async (path, { method = "GET", body } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const T = o.tenderMono;
for (const [label, p] of [["DC1", `/tenders/${T}/administrative-dc1/generate-pdf`], ["DC2", `/tenders/${T}/administrative-dc2/generate-pdf`], ["ACTE/ATTRI1", `/tenders/${T}/administrative-engagement-act/generate-pdf`]]) {
  const g = await call(p, { method: "POST", body: {} });
  console.log(`${label.padEnd(12)} PDF ->`, g.status, JSON.stringify(g.body).slice(0, 190));
}
console.log("\n=== §16 PRICING ===");
const det = await call(`/pricing-schedules?tenderId=${T}`);
console.log("liste chiffrages ->", det.status, JSON.stringify(det.body).slice(0, 200));
const cr = await call("/pricing-schedules", { method: "POST", body: { tenderId: T, kind: "BPU", title: "BPU recette" } });
console.log("creation BPU     ->", cr.status, JSON.stringify(cr.body).slice(0, 220));
