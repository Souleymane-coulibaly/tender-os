/**
 * V2 Sprint 25 (mission §25.41B-P) — remplace `ProductPreviewMock` (Sprint 23, aperçu générique
 * avec des tirets "—") par une composition reflétant le VRAI Dashboard Premium (Checkpoint 25C :
 * `apps/web/src/app/app/(protected)/dashboard-kpi-row.tsx`/`priority-tenders-widget.tsx`/
 * `usage-widget.tsx`), même palette/cards/typography/pictogrammes (mission §25.41E).
 *
 * OWNERSHIP (mission §25.41O) — cette composition est un fac-similé statique, PAS un import des
 * composants Dashboard réels (mission §25.41K "ne pas modifier le Dashboard lui-même pour cet
 * effet" — le cadre premium ci-dessous appartient exclusivement à la Landing). Elle est
 * volontairement dupliquée en apparence : toute future refonte visuelle du Dashboard Premium
 * (widgets réels ci-dessus) doit s'accompagner d'une mise à jour manuelle de CE fichier pour rester
 * cohérente (mission §25.41E "cohérence visuelle"), il n'existe aucune synchronisation automatique.
 *
 * DONNÉES (mission §25.41C/§25.41F/§25.41G) — uniquement fictives : "Maintenance multi-technique —
 * Région Île-de-France", "Modernisation SI — Métropole Exemple", "Prestations de nettoyage
 * industriel — Groupe Démo" (noms fournis par la mission), organisation Business active (jamais
 * l'état Trial comme visuel principal). Aucune donnée client réelle.
 *
 * ACCESSIBILITÉ (mission §25.41M) — `role="img"` + `aria-label` reprenant le texte alternatif
 * suggéré par la mission, plutôt qu'un simple `aria-hidden` : contrairement à l'ancien
 * `ProductPreviewMock` (purement décoratif, uniquement des tirets "—"), cette composition porte une
 * information réelle (nature du produit) qu'un lecteur d'écran doit pouvoir recevoir en une phrase,
 * jamais en lisant chaque ligne du fac-similé (mission "ne pas surcharger l'alt").
 */
function KpiMini({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-tenderos-navy/10 bg-white p-3">
      <p className="text-[11px] text-tenderos-slate">{label}</p>
      <p className="mt-1 text-lg font-extrabold" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

export function DashboardPreview() {
  return (
    <div
      role="img"
      aria-label="Tableau de bord TenderOS présentant les appels d'offres en cours, les échéances et les opportunités."
      className="rounded-2xl border border-tenderos-navy/10 bg-white p-4 shadow-2xl shadow-tenderos-navy/10 ring-1 ring-tenderos-gold/10"
    >
      <div className="flex items-center justify-between border-b border-tenderos-navy/5 px-1 pb-3">
        <div>
          <p className="font-tenderos-display text-sm font-bold text-tenderos-navy">Bonjour Camille 👋</p>
          <p className="text-[11px] text-tenderos-slate">Voici ce qui nécessite votre attention aujourd&apos;hui.</p>
        </div>
        <span className="rounded-full bg-tenderos-light px-2.5 py-1 text-[10px] font-bold text-tenderos-navy">Business</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiMini label="AO en cours" value="7" accent="#1472FF" />
        <KpiMini label="Échéances 7j" value="3" accent="#7C4DFF" />
        <KpiMini label="À valider" value="2" accent="#1A9E5C" />
        <KpiMini label="Opportunités" value="12" accent="#D4AF37" />
      </div>

      <div className="mt-3 rounded-xl border border-tenderos-navy/10 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-tenderos-slate">Mes dossiers prioritaires</p>
        <ul className="mt-2 flex flex-col gap-2">
          {[
            { title: "Maintenance multi-technique — Région Île-de-France", status: "Préparation", deadline: "J-5" },
            { title: "Modernisation SI — Métropole Exemple", status: "Analyse DCE", deadline: "J-10" },
            { title: "Prestations de nettoyage industriel — Groupe Démo", status: "À valider", deadline: "J-13" },
          ].map((row) => (
            <li key={row.title} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-tenderos-navy">{row.title}</span>
              <span className="shrink-0 rounded-full bg-tenderos-light px-2 py-0.5 font-medium text-tenderos-navy/70">{row.status}</span>
              <span className="shrink-0 text-tenderos-slate">{row.deadline}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-tenderos-navy/10 p-2.5">
          <p className="text-[10px] text-tenderos-slate">Crédits AO</p>
          <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-tenderos-light">
            <span className="block h-full w-2/3 rounded-full bg-tenderos-blue" />
          </span>
        </div>
        <div className="rounded-xl border border-tenderos-navy/10 p-2.5">
          <p className="text-[10px] text-tenderos-slate">Chat IA</p>
          <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-tenderos-light">
            <span className="block h-full w-1/3 rounded-full bg-tenderos-blue" />
          </span>
        </div>
        <div className="rounded-xl border border-tenderos-navy/10 p-2.5">
          <p className="text-[10px] text-tenderos-slate">Stockage</p>
          <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-tenderos-light">
            <span className="block h-full w-1/5 rounded-full bg-tenderos-blue" />
          </span>
        </div>
      </div>
    </div>
  );
}
