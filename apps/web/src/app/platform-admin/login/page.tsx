import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion — Platform Admin — TenderOS" };

export default function PlatformAdminLoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold">TenderOS Platform Admin</h1>
        <p className="text-sm text-neutral-600">Réservé aux administrateurs de la plateforme.</p>
      </div>
      <LoginForm />
    </main>
  );
}
