/** Preuve REC-001 — organisation creee par le VRAI onboarding, API reelle. */
const API = "http://localhost:4000";
const PW = "PreDecom#2026";
const s = Date.now();
const call = async (path, { method = "GET", body, token, org } = {}) => {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  if (org) h["X-Organization-Id"] = org;
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const reg = async (label) => {
  const email = `predecom-${label}-${s}@recette.test`;
  const a = await call("/auth/register", { method: "POST", body: { email, password: PW, displayName: label, termsAccepted: true } });
  const b = await call("/auth/login", { method: "POST", body: { email, password: PW } });
  return { id: a.body?.id, token: b.body?.accessToken };
};
const owner = await reg("owner");
const second = await reg("second");
const org = await call("/organizations", { method: "POST", token: owner.token, body: { name: `PreDecom Org ${s}`, slug: `predecom-org-${s}`, countryCode: "FR", defaultTimezone: "Europe/Paris" } });
console.log("creation organisation ->", org.status, org.body?.id);
const O = org.body?.id;
const ent = await call("/billing/entitlements", { token: owner.token, org: O });
console.log("entitlements          ->", JSON.stringify(ent.body));
const credits = await call("/billing/ao-credits", { token: owner.token, org: O });
console.log("credits AO            ->", JSON.stringify(credits.body), " <- 0 attendu : aucun credit gratuit");
const usage = await call("/billing/usage", { token: owner.token, org: O });
console.log("usage                 ->", JSON.stringify(usage.body));
const add = await call("/organization-memberships", { method: "POST", token: owner.token, org: O, body: { userId: second.id, role: "CONTRIBUTOR" } });
console.log("ajout 2e membre       ->", add.status, add.body?.error?.code ?? "", " <- 402 attendu : 1 siege, deja pris par le fondateur");
const dce = await call(`/tenders`, { method: "POST", token: owner.token, org: O, body: { title: "t", clientAccountId: "00000000-0000-4000-8000-000000000000" } });
console.log("operation metier      ->", dce.status, dce.body?.error?.code ?? "", " <- aucun acces gratuit accorde");
