import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Réinitialiser le mot de passe — TenderOS", robots: { index: false, follow: false } };

type SearchParams = { token?: string };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const token = params.token?.trim();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-tenderos-light p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-tenderos-display text-2xl font-bold text-tenderos-navy">Réinitialiser le mot de passe</h1>
        {token ? (
          <p className="max-w-sm text-sm text-tenderos-slate">Choisissez votre nouveau mot de passe.</p>
        ) : null}
      </div>

      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex flex-col gap-4 text-center">
          <p className="max-w-sm text-sm text-tenderos-slate">
            Ce lien de réinitialisation est incomplet ou invalide. Demandez-en un nouveau.
          </p>
          <Link href="/app/forgot-password" className="text-sm font-semibold text-tenderos-blue hover:underline">
            Demander un nouveau lien
          </Link>
        </div>
      )}
    </main>
  );
}
