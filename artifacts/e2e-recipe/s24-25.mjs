import { readFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const call = async (path, token, org, { method = "GET", body } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}`, "X-Organization-Id": org, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, code: j?.error?.code };
};
const A = o.orgs.A.id, B = o.orgs.B.id;
console.log("=== §24 RBAC — operations sensibles par role ===");
const ops = [
  ["lire dashboard", "GET", "/dashboard", null],
  ["creer client", "POST", "/clients", { name: `rbac-${Date.now()}` }],
  ["creer tender", "POST", "/tenders", { title: "rbac", clientAccountId: o.clients.A1.id }],
  ["decision GO", "POST", `/opportunities/${o.opportunityId}/go-no-go-decisions`, { decision: "NO_GO", justification: "test rbac" }],
  ["changer role", "PATCH", `/organization-memberships/${o.memberships?.CONTRIBUTOR_A?.id ?? "00000000-0000-4000-8000-000000000000"}/role`, { role: "BID_MANAGER" }],
];
for (const role of ["OWNER_A", "ORG_ADMIN_A", "BID_MANAGER_A", "CONTRIBUTOR_A", "EXTERNAL_CONSULTANT_A"]) {
  const line = [];
  for (const [label, method, path, body] of ops) {
    const r = await call(path, o.users[role].token, A, { method, body });
    line.push(`${label}:${r.status}`);
  }
  console.log(role.padEnd(22), line.join("  "));
}
console.log("\n=== §25 ISOLATION TENANT — OWNER_B vers ressources Org A ===");
const targets = [
  ["client A1", `/clients/${o.clients.A1.id}`],
  ["tender", `/tenders/${o.tenderMono}`],
  ["DCE doc", `/documents/${o.dceDocumentId}`],
  ["package", `/response-packages/${o.packageId}`],
  ["opportunite", `/opportunities/${o.opportunityId}`],
  ["chiffrage", `/pricing-schedules/${o.pricingScheduleId}`],
  ["membres", "/organization-memberships"],
];
for (const [label, path] of targets) {
  const own = await call(path, o.users.OWNER_B.token, B);
  const forced = await call(path, o.users.OWNER_B.token, A);
  console.log(`${label.padEnd(14)} header B: ${own.status}${own.code ? " " + own.code : ""}   | header A force: ${forced.status}${forced.code ? " " + forced.code : ""}`);
}
