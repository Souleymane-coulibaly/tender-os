import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Mot de passe oublié — TenderOS", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-tenderos-light p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-tenderos-display text-2xl font-bold text-tenderos-navy">Mot de passe oublié</h1>
        <p className="max-w-sm text-sm text-tenderos-slate">
          Saisissez l&apos;adresse email associée à votre compte, nous vous enverrons un lien pour choisir un nouveau
          mot de passe.
        </p>
      </div>
      <ForgotPasswordForm />
    </main>
  );
}
