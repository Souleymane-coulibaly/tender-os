import { readFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const call = async (path, { method = "GET", body, token = o.users.OWNER_A.token, org = o.orgs.A.id } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Organization-Id": org }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const list = await call("/notifications?limit=5");
console.log("liste        ->", list.status, "| retournees:", (list.body?.items ?? []).length);
for (const n of (list.body?.items ?? []).slice(0, 3)) console.log("   -", n.type, "|", (n.title ?? "").slice(0, 60), "| lu:", !!n.readAt, "| url:", (n.targetUrl ?? "").slice(0, 50));
const unread = await call("/notifications/unread-count");
console.log("non lues     ->", unread.status, JSON.stringify(unread.body));
const first = (list.body?.items ?? [])[0];
if (first) {
  const mark = await call(`/notifications/${first.id}/read`, { method: "POST" });
  console.log("marquer lu   ->", mark.status);
  const after = await call("/notifications/unread-count");
  console.log("non lues apres->", after.status, JSON.stringify(after.body));
}
const all = await call("/notifications/read-all", { method: "POST" });
console.log("tout lu      ->", all.status, JSON.stringify(all.body).slice(0, 100));
const prefs = await call("/notifications/preferences");
console.log("preferences  ->", prefs.status, JSON.stringify(prefs.body).slice(0, 220));
// Isolation : OWNER_B ne doit voir aucune notification de l'org A
const foreign = await call("/notifications?limit=5", { token: o.users.OWNER_B.token, org: o.orgs.B.id });
console.log("OWNER_B voit ->", foreign.status, "| items:", (foreign.body?.items ?? []).length, "(0 attendu)");
