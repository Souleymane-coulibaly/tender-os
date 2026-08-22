import Link from "next/link";
import { Card } from "../../../components/ui";
import { canManageWorkspace, canCreateTender } from "./dashboard-permissions";
import { canUseMarketWatch } from "../../../lib/market-watch-types";

const IMPORT_ICON = <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
const FOLDER_PLUS_ICON = <path d="M9 3H4a1 1 0 00-1 1v15a1 1 0 001 1h16a1 1 0 001-1V7a1 1 0 00-1-1h-9l-2-3z M12 11v6M9 14h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
const RADAR_ICON = <path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
const DOC_PLUS_ICON = <path d="M9 2h6l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zM12 12v6M9 15h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;

/**
 * V2 Sprint 25 (Dashboard Premium) — mission §25.66/§25.67 "Actions rapides... ne jamais afficher
 * une action inaccessible au user". "Inviter un membre" volontairement ABSENTE d'ICI : la
 * gestion d'équipe (`/app/members`, invitation par email incluse depuis Checkpoint P2.3-E2) vit
 * déjà dans la navigation globale persistante (`NAV_SECTIONS`, section "Paramètres") — la
 * dupliquer en Action Rapide violerait mission §6 "ne pas dupliquer le global navigation shell
 * s'il existe déjà". Checkpoint TENDEROS-2.1-P2.3-E5 (addendum §22) : point d'entrée déjà
 * satisfait par le shell global, aucun ajout nécessaire ici.
 *
 * Checkpoint TENDEROS-2.1-P2.3-E5.1 (Design System V2) — enveloppe Card (doublon exact du balisage
 * local précédent).
 */
type QuickAction = { href: string; label: string; icon: React.ReactNode };

export function QuickActionsPanel({ actorRole }: { actorRole: string | undefined }) {
  const actions: QuickAction[] = [];
  // Correctif audit Codex Checkpoint 25C (P1) — "Importer un DCE" partage la MÊME cible que "Créer
  // un dossier" (`/app/tenders/new`, aucune route d'import DCE indépendante n'existe) : gaté par
  // `TenderPermission.Create` (`canCreateTender`), jamais `canManageWorkspace` (qui inclut
  // CONTRIBUTOR, sans ce droit sur cette route précise — mission §25.67 "ne jamais afficher une
  // action inaccessible au user").
  if (canCreateTender(actorRole)) actions.push({ href: "/app/tenders/new", label: "Importer un DCE", icon: IMPORT_ICON });
  if (canCreateTender(actorRole)) actions.push({ href: "/app/tenders/new", label: "Créer un dossier", icon: FOLDER_PLUS_ICON });
  if (canUseMarketWatch(actorRole)) actions.push({ href: "/app/market-watch", label: "Configurer la veille", icon: RADAR_ICON });
  if (canManageWorkspace(actorRole)) actions.push({ href: "/app/documents/new", label: "Ajouter un document", icon: DOC_PLUS_ICON });

  if (actions.length === 0) return null;

  return (
    <Card title="Actions rapides">
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="flex flex-col items-start gap-2 rounded-xl border border-tenderos-navy/10 p-3 text-tenderos-navy transition hover:border-tenderos-blue/30 hover:bg-tenderos-light/60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {action.icon}
            </svg>
            <span className="text-sm font-medium">{action.label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
