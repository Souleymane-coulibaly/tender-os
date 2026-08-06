"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { archiveBankAccountAction, createBankAccountAction, type FormActionState } from "../../../../company-profile-actions";
import type { CompanyBankAccount } from "../../../../../../lib/company-profile-types";

const INITIAL_STATE: FormActionState = {};

/** Mission §4.4/§7 — l'IBAN complet n'est jamais visible ici : l'API masque déjà la liste (droit
 *  bancaire dédié requis même pour la lecture). Archivage uniquement, jamais de suppression. */
export function BankAccountsSection({ clientId, bankAccounts }: { clientId: string; bankAccounts: CompanyBankAccount[] }) {
  const router = useRouter();
  const boundAction = createBankAccountAction.bind(null, clientId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);
  const [archivingId, setArchivingId] = useState<string | undefined>();
  const [archiveError, setArchiveError] = useState<string | undefined>();

  async function handleArchive(bankAccountId: string) {
    setArchivingId(bankAccountId);
    const result = await archiveBankAccountAction(clientId, bankAccountId);
    setArchivingId(undefined);
    setArchiveError(result.error);
    if (!result.error) router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {bankAccounts.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun compte bancaire enregistré.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Titulaire</th>
                <th className="py-2 pr-4">IBAN</th>
                <th className="py-2 pr-4">Banque</th>
                <th className="py-2 pr-4">Statut</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bankAccounts.map((account) => (
                <tr key={account.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-medium text-neutral-900">{account.accountHolder}</td>
                  <td className="py-2 pr-4 font-mono text-neutral-600">{account.iban}</td>
                  <td className="py-2 pr-4 text-neutral-600">{account.bankName ?? "—"}</td>
                  <td className="py-2 pr-4 text-neutral-600">{account.status}</td>
                  <td className="py-2 pr-4">
                    {account.status === "ACTIVE" ? (
                      <button
                        type="button"
                        onClick={() => handleArchive(account.id)}
                        disabled={archivingId === account.id}
                        className="text-red-700 hover:underline disabled:opacity-50"
                      >
                        Archiver
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {archiveError ? (
        <p role="alert" className="text-sm text-red-600">
          {archiveError}
        </p>
      ) : null}

      <form action={formAction} className="flex flex-col gap-3 rounded border border-neutral-200 p-3">
        <h3 className="text-sm font-semibold text-neutral-900">Ajouter un compte bancaire</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="accountHolder" className="text-xs text-neutral-600">
              Titulaire *
            </label>
            <input id="accountHolder" name="accountHolder" required className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="bankName" className="text-xs text-neutral-600">
              Banque
            </label>
            <input id="bankName" name="bankName" className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="iban" className="text-xs text-neutral-600">
              IBAN *
            </label>
            <input id="iban" name="iban" required maxLength={34} className="rounded border border-neutral-300 px-2 py-1.5 text-sm font-mono" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="bic" className="text-xs text-neutral-600">
              BIC
            </label>
            <input id="bic" name="bic" maxLength={11} className="rounded border border-neutral-300 px-2 py-1.5 text-sm font-mono" />
          </div>
        </div>
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
        <button type="submit" disabled={isPending} className="self-start rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {isPending ? "Ajout..." : "Ajouter"}
        </button>
      </form>
    </div>
  );
}
