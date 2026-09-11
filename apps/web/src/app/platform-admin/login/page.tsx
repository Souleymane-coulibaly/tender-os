import type { Metadata } from "next";
import { Card } from "../../../components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion — Platform Admin — TenderOS" };

export default function PlatformAdminLoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-tenderos-light p-4 sm:p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-tenderos-display text-xl font-extrabold text-tenderos-navy sm:text-2xl">TenderOS Platform Admin</h1>
        <p className="text-sm text-tenderos-slate">Réservé aux administrateurs de la plateforme.</p>
      </div>
      <Card className="w-full max-w-sm">
        <LoginForm />
      </Card>
    </main>
  );
}
