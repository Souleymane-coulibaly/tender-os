import { readFileSync, writeFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const H = { Authorization: `Bearer ${o.users.OWNER_A.token}`, "X-Organization-Id": o.orgs.A.id };
const call = async (path, { method = "GET", body } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: { ...H, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
// PDF minimal valide
function pdf(text) {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let out = "%PDF-1.4\n"; const off = [];
  objs.forEach((b, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${b}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((x) => String(x).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
const T = o.tenderMono;
const dce = await call(`/tenders/${T}/dce`, { method: "POST" });
console.log("init DCE      ->", dce.status, JSON.stringify(dce.body).slice(0, 160));
const form = new FormData();
form.append("files", new Blob([pdf("Reglement de consultation - recette E2E TenderOS")], { type: "application/pdf" }), "reglement-consultation.pdf");
const up = await fetch(`${API}/api/v1/tenders/${T}/dce/documents`, { method: "POST", headers: H, body: form });
const upBody = await up.json();
console.log("upload doc    ->", up.status, JSON.stringify(upBody).slice(0, 220));
const docId = upBody?.accepted?.[0]?.documentId;
if (docId) {
  o.dceDocumentId = docId; writeFileSync("artifacts/e2e-recipe/dataset.json", JSON.stringify(o, null, 2));
  for (let i = 0; i < 25; i++) {
    const ex = await call(`/tenders/${T}/dce/documents/${docId}/extraction`);
    if (["SUCCEEDED","PARTIALLY_SUCCEEDED","FAILED","NOT_PROCESSABLE"].includes(ex.body?.status)) {
      console.log("extraction    ->", ex.status, "| statut:", ex.body.status, "| chunks:", ex.body.chunkCount, "| chars:", ex.body.characterCount); break;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  const docs = await call(`/tenders/${T}/dce/documents`);
  console.log("liste docs    ->", docs.status, "| nb:", (docs.body?.items ?? docs.body ?? []).length);
}
