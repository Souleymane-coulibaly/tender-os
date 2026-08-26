import { readFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const H = { Authorization: `Bearer ${o.users.OWNER_A.token}`, "X-Organization-Id": o.orgs.A.id };
const call = async (path, { method = "GET", body } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: { ...H, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const T = o.tenderMono;
// §12 versioning : remplacer le document
function pdf(t) { const c = `BT /F1 12 Tf 72 720 Td (${t}) Tj ET`; const objs=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",`<< /Length ${c.length} >>\nstream\n${c}\nendstream`,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]; let out="%PDF-1.4\n"; const off=[]; objs.forEach((b,i)=>{off.push(out.length); out+=`${i+1} 0 obj\n${b}\nendobj\n`;}); const x=out.length; out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+off.map(v=>String(v).padStart(10,"0")+" 00000 n \n").join(""); out+=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`; return Buffer.from(out,"latin1"); }
const f = new FormData();
f.append("file", new Blob([pdf("Reglement de consultation - VERSION 2 modifiee")], { type: "application/pdf" }), "reglement-v2.pdf");
const v = await fetch(`${API}/api/v1/documents/${o.dceDocumentId}/versions`, { method: "POST", headers: H, body: f });
console.log("nouvelle version ->", v.status, (await v.text()).slice(0, 200));
const doc = await call(`/documents/${o.dceDocumentId}`);
console.log("document         ->", doc.status, "| version courante:", doc.body?.currentVersion?.versionNumber ?? doc.body?.currentVersionNumber, "| versions:", (doc.body?.versions ?? []).length);
// §13 readiness / checklist
const ck = await call(`/tenders/${T}/cockpit`);
console.log("cockpit          ->", ck.status, JSON.stringify(ck.body).slice(0, 300));
