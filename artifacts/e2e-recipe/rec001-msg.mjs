const API = "http://localhost:4000";
const PW = "PreDecom#2026"; const s = Date.now();
const call = async (p, { method = "GET", body, token, org } = {}) => {
  const h = { "Content-Type": "application/json" }; if (token) h.Authorization = `Bearer ${token}`; if (org) h["X-Organization-Id"] = org;
  const r = await fetch(`${API}/api/v1${p}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j };
};
const reg = async (l) => { const e = `msg-${l}-${s}@recette.test`; const a = await call("/auth/register", { method: "POST", body: { email: e, password: PW, displayName: l, termsAccepted: true } }); const b = await call("/auth/login", { method: "POST", body: { email: e, password: PW } }); return { id: a.body?.id, token: b.body?.accessToken }; };
const o1 = await reg("o"); const o2 = await reg("s");
const org = await call("/organizations", { method: "POST", token: o1.token, body: { name: `Msg ${s}`, slug: `msg-org-${s}`, countryCode: "FR", defaultTimezone: "Europe/Paris" } });
const add = await call("/organization-memberships", { method: "POST", token: o1.token, org: org.body.id, body: { userId: o2.id, role: "CONTRIBUTOR" } });
console.log("MESSAGE:", add.body?.error?.message);
