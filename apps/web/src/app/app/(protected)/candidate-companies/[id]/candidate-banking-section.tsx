"use client";

import { useActionState } from "react";
import { Alert, Badge, Button, EmptyState } from "../../../../../components/ui";
import { isArchived, type CandidateBankAccount } from "../../../../../lib/candidate-capability-types";
import { archiveCandidateBankAccountAction, createCandidateBankAccountAction, type CapabilityActionState } from "../../../candidate-capability-actions";

const INITIAL_STATE: CapabilityActionState = {};

/**
 * Checkpoint TENDEROS-2.1-CCV2-F — coordonnées bancaires de l'entreprise candidate.
 *
 * SÉCURITÉ. Cette section n'est montée que si le rôle porte `candidate:read_banking`, et le
 * formulaire que s'il porte `candidate:manage_banking`. Ce masquage est un CONFORT, jamais la
 * protection : l'autorité reste `CandidateCapabilityAccessService` côté API, qui refuse en 403
 * quoi que montre l'écran (CCV2-C.1). Le composant n'est jamais rendu « puis masqué » — la décision
 * est prise côté serveur avant l'envoi du HTML, donc aucune donnée bancaire ne peut apparaître le
 * temps d'un chargement de permission.
 *
 * IBAN. La valeur affichée est celle renvoyée par l'API, déjà MASQUÉE (`•••…1234`) : l'IBAN complet
 * ne quitte jamais la surface candidate. L'interface ne tente jamais de le reconstituer et
 * n'affiche aucun champ de relecture.
 */
export function CandidateBankingSection({
  candidateCompanyId,
  accounts,
  canManage,
}: {
  candidateCompanyId: string;
  accounts: CandidateBankAccount[];
  canManage: boolean;
}) {
  const boundAction = createCandidateBankAccountAction.bind(null, candidateCompanyId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info">
        Les coordonnées bancaires sont réservées aux rôles disposant de la permission bancaire. L&apos;IBAN est affiché masqué et n&apos;est jamais restitué en clair.
      </Alert>

      {accounts.length === 0 ? (
        <EmptyState
          title="Aucun compte bancaire"
          description={canManage ? "Ajoutez un compte pour alimenter les pièces qui l'exigent." : "Vous n'avez pas les droits nécessaires pour en ajouter."}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-tenderos-mist text-left text-tenderos-slate">
                <th scope="col" className="py-2 pr-4 text-xs font-semibold uppercase">Titulaire</th>
                <th scope="col" className="py-2 pr-4 text-xs font-semibold uppercase">Banque</th>
                <th scope="col" className="py-2 pr-4 text-xs font-semibold uppercase">IBAN</th>
                <th scope="col" className="py-2 pr-4 text-xs font-semibold uppercase">BIC</th>
                <th scope="col" className="py-2 pr-4 text-xs font-semibold uppercase">État</th>
                {canManage ? <th scope="col" className="py-2 text-right text-xs font-semibold uppercase">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className={`border-b border-tenderos-mist/60 ${isArchived(account.status) ? "opacity-60" : ""}`}>
                  <td className="py-2 pr-4 font-medium text-tenderos-navy">{account.accountHolder}</td>
                  <td className="py-2 pr-4 text-tenderos-slate">{account.bankName ?? "Non renseigné"}</td>
                  <td className="py-2 pr-4 font-mono text-tenderos-navy">{account.iban}</td>
                  <td className="py-2 pr-4 text-tenderos-slate">{account.bic ?? "Non renseigné"}</td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap items-center gap-1">
                      {account.isPrimary ? <Badge tone="success">Principal</Badge> : null}
                      {isArchived(account.status) ? <Badge tone="neutral">Archivé</Badge> : null}
                    </div>
                  </td>
                  {canManage ? (
                    <td className="py-2 text-right">
                      {isArchived(account.status) ? null : (
                        <form
                          action={async () => {
                            await archiveCandidateBankAccountAction(candidateCompanyId, account.id);
                          }}
                        >
                          <Button type="submit" variant="ghost" size="sm">
                            Archiver
                          </Button>
                        </form>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage ? (
        <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-tenderos-mist p-4">
          <h3 className="text-sm font-semibold text-tenderos-navy">Ajouter un compte bancaire</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="bank-accountHolder" className="text-xs font-medium text-tenderos-slate">
                Titulaire *
              </label>
              <input id="bank-accountHolder" name="accountHolder" required className="rounded-md border border-tenderos-mist px-2 py-1.5 text-sm text-tenderos-navy" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="bank-bankName" className="text-xs font-medium text-tenderos-slate">
                Banque
              </label>
              <input id="bank-bankName" name="bankName" className="rounded-md border border-tenderos-mist px-2 py-1.5 text-sm text-tenderos-navy" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="bank-iban" className="text-xs font-medium text-tenderos-slate">
                IBAN *
              </label>
              <input
                id="bank-iban"
                name="iban"
                required
                aria-describedby="bank-iban-help"
                className="rounded-md border border-tenderos-mist px-2 py-1.5 font-mono text-sm text-tenderos-navy"
              />
              <p id="bank-iban-help" className="text-xs text-tenderos-slate">
                Contrôlé selon la norme ISO 13616 ; une clé invalide est refusée.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="bank-bic" className="text-xs font-medium text-tenderos-slate">
                BIC
              </label>
              <input id="bank-bic" name="bic" className="rounded-md border border-tenderos-mist px-2 py-1.5 font-mono text-sm text-tenderos-navy" />
            </div>
            <div className="flex items-center gap-2 self-end pb-1">
              <input id="bank-isPrimary" name="isPrimary" type="checkbox" className="h-4 w-4 rounded border-tenderos-mist" />
              <label htmlFor="bank-isPrimary" className="text-xs font-medium text-tenderos-slate">
                Compte principal
              </label>
            </div>
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-danger-fg">
              {state.error}
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Enregistrement…" : "Ajouter le compte"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
