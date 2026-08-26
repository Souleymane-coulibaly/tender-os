import { readFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const H = { Authorization: `Bearer ${o.users.OWNER_A.token}`, "X-Organization-Id": o.orgs.A.id, "Content-Type": "application/json" };
const call = async (path, { method = "GET", body } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const before = await call("/billing/ao-credits");
console.log("credits AVANT ->", JSON.stringify(before.body));
const start = await call(`/tenders/${o.tenderMono}/submissions/start`, { method: "POST", body: { packageId: o.packageId, platform: "PLACE" } });
console.log("start depot   ->", start.status, JSON.stringify(start.body).slice(0, 240));
const rec = await call(`/tenders/${o.tenderMono}/submissions`, { method: "POST", body: { packageId: o.packageId, platform: "PLACE" } });
console.log("depot         ->", rec.status, JSON.stringify(rec.body).slice(0, 260));
const after = await call("/billing/ao-credits");
console.log("credits APRES ->", JSON.stringify(after.body));
// §21 double action : rejouer le depot ne doit jamais double-debiter
const again = await call(`/tenders/${o.tenderMono}/submissions`, { method: "POST", body: { packageId: o.packageId, platform: "PLACE" } });
console.log("re-depot      ->", again.status, JSON.stringify(again.body?.error?.code ?? again.body).slice(0, 160));
const after2 = await call("/billing/ao-credits");
console.log("credits FINAL ->", JSON.stringify(after2.body), "  <- aucun double debit attendu");
