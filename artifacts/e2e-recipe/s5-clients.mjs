import { readFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const call = async (path, { method = "GET", body, token = o.users.OWNER_A.token, org = o.orgs.A.id } = {}) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Organization-Id": org }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
// §5 CRUD
const detail = await call(`/clients/${o.clients.A1.id}`);
console.log("lecture A1        ->", detail.status, detail.body?.name ?? "");
const edit = await call(`/clients/${o.clients.A1.id}`, { method: "PATCH", body: { sector: "BTP recette" } });
console.log("edition A1        ->", edit.status, edit.body?.sector ?? JSON.stringify(edit.body).slice(0,120));

// §5 scope client : CONTRIBUTOR_A assigne UNIQUEMENT a A1
const asg = await call(`/clients/${o.clients.A1.id}/assignments`, { method: "POST", body: { userId: o.users.CONTRIBUTOR_A.id, role: "CONTRIBUTOR" } });
console.log("assignation A1    ->", asg.status, asg.status >= 400 ? JSON.stringify(asg.body).slice(0,160) : "");

const asContrib = { token: o.users.CONTRIBUTOR_A.token };
const list = await call("/clients", asContrib);
const names = (list.body?.items ?? []).map((c) => c.name);
console.log("CONTRIBUTOR voit  ->", list.status, JSON.stringify(names));
const a2 = await call(`/clients/${o.clients.A2.id}`, asContrib);
console.log("CONTRIBUTOR -> A2 ->", a2.status, "(404 attendu : jamais 403 qui confirmerait l'existence)");
const dash = await call("/dashboard", asContrib);
console.log("dashboard contrib ->", dash.status, "scope:", JSON.stringify(dash.body?.scope));
