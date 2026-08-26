import { readFileSync } from "node:fs";
const out = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const res = await fetch("http://localhost:4000/api/v1/billing/plan-catalog", { headers: { Authorization: `Bearer ${out.users.OWNER_A.token}`, "X-Organization-Id": out.orgs.A.id } });
const j = await res.json();
for (const p of j.items) console.log(String(p.tier).padEnd(12), "| mensuel:", p.monthlyPriceCents, "| annuel:", p.yearlyPriceCents, "| unitaire:", p.onePriceCents, "| sieges:", p.quotas?.USER_SEATS ?? p.quotas?.SEATS ?? JSON.stringify(p.quotas ?? {}).slice(0,60));
