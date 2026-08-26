import { readFileSync } from "node:fs";
const out = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const h = { "Content-Type": "application/json", Authorization: `Bearer ${out.users.OWNER_A.token}`, "X-Organization-Id": out.orgs.A.id };
for (const [label, body] of [
  ["STARTER mensuel", { target: { kind: "SUBSCRIPTION", planTier: "STARTER", billingInterval: "MONTHLY" } }],
  ["BUSINESS mensuel", { target: { kind: "SUBSCRIPTION", planTier: "BUSINESS", billingInterval: "MONTHLY" } }],
  ["PASS unitaire", { target: { kind: "PASS" } }],
]) {
  const r = await fetch("http://localhost:4000/api/v1/billing/checkout-sessions", { method: "POST", headers: h, body: JSON.stringify(body) });
  console.log(label, "->", r.status, (await r.text()).slice(0, 200));
}
