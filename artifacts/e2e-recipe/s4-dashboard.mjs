import { readFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const call = async (path, token = o.users.OWNER_A.token, org = o.orgs.A.id) => {
  const r = await fetch(`${API}/api/v1${path}`, { headers: { Authorization: `Bearer ${token}`, "X-Organization-Id": org } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const d = await call("/dashboard");
console.log("GET /dashboard ->", d.status);
if (d.status === 200) {
  const b = d.body;
  console.log("kpis        :", JSON.stringify(b.kpis));
  console.log("analytics   : periodDays=" + b.analytics?.periodDays, "| points=" + b.analytics?.activityTrend?.length, "| goRate=" + b.analytics?.goRate);
  console.log("pipeline    :", JSON.stringify(b.pipeline));
  console.log("packages    :", JSON.stringify(b.packages));
  console.log("goNoGo      :", JSON.stringify(b.goNoGo));
  console.log("deadlines   :", b.deadlines?.length, "| attention:", b.attentionItems?.length, "| activity:", b.activity?.length);
  console.log("marketWatch :", JSON.stringify(b.marketWatch));
  console.log("checklist   :", b.activationChecklist?.completedCount + "/" + b.activationChecklist?.totalCount);
  console.log("scope       :", JSON.stringify(b.scope));
}
for (const p of [7, 30, 90]) { const r = await call(`/dashboard?periodDays=${p}`); console.log(`periodDays=${p} ->`, r.status, "points:", r.body?.analytics?.activityTrend?.length); }
for (const p of [45, 365, 0]) { const r = await call(`/dashboard?periodDays=${p}`); console.log(`periodDays=${p} ->`, r.status, "(refus attendu)"); }
const scoped = await call(`/dashboard?clientId=${o.clients.A1.id}`);
console.log("clientId=A1 ->", scoped.status, "scope:", JSON.stringify(scoped.body?.scope));
