import { readFileSync, writeFileSync } from "node:fs";
const API = "http://localhost:4000";
const o = JSON.parse(readFileSync("artifacts/e2e-recipe/dataset.json", "utf8"));
const r = await fetch(`${API}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: o.users.OWNER_A.email, password: "RecetteE2E#2026" }) });
const j = await r.json();
o.users.OWNER_A.token = j.accessToken;
writeFileSync("artifacts/e2e-recipe/dataset.json", JSON.stringify(o, null, 2));
console.log("reconnexion OWNER_A ->", r.status, j.accessToken ? "token renouvele" : JSON.stringify(j).slice(0, 120));
