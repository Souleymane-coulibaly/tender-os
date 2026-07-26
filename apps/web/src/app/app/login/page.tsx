import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion — TenderOS" };

export default function AppLoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold">TenderOS</h1>
        <p className="text-sm text-neutral-600">Connectez-vous pour gerer vos appels d&apos;offres.</p>
      </div>
      <LoginForm />
    </main>
  );
}
