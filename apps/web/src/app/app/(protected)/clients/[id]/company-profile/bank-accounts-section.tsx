"use client";

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.4 — rubrique en LECTURE SEULE.
 *
 * Le formulaire de creation a ete retire : sa route refusait tout depuis CCV2-I.1 et n'existe plus.
 * Cette donnee appartient desormais a `CandidateCompany`. La LISTE reste affichee — des lignes
 * Legacy subsistent chez les clients sans entreprise candidate (registre CCV2-I.2) et rien d'autre
 * ne les montre : les masquer reviendrait a les faire disparaitre du produit.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { archiveBankAccountAction } from "../../../../company-profile-actions";
import {
  SATELLITE_STATUS_LABELS,
  type CompanyBankAccount,
} from "../../../../../../lib/company-profile-types";

/** Mission §4.4/§7 — l'IBAN complet n'est jamais visible ici : l'API masque déjà la liste (droit
 *  bancaire dédié requis même pour la lecture). Archivage uniquement, jamais de suppression. */
export function BankAccountsSection({
  clientId,
  bankAccounts,
}: {
  clientId: string;
  bankAccounts: CompanyBankAccount[];
}) {
  const router = useRouter();
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
                  <td className="py-2 pr-4 font-medium text-neutral-900">
                    {account.accountHolder}
                  </td>
                  <td className="py-2 pr-4 font-mono text-neutral-600">{account.iban}</td>
                  <td className="py-2 pr-4 text-neutral-600">{account.bankName ?? "—"}</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {SATELLITE_STATUS_LABELS[account.status] ?? account.status}
                  </td>
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
    </div>
  );
}
