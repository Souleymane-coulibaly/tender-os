import type { ReactNode } from "react";

type Integration = Readonly<{
  name: string;
  subtitle: string;
  badge?: "Entreprise";
  icon: ReactNode;
}>;

/**
 * V2 Sprint 23A (landing, finalisation) — mission §21-§30. Pictogrammes en SVG local inline
 * (aucun asset téléchargé, aucune dépendance ajoutée — mission §29 "auditer l'existant d'abord",
 * confirmé : aucune bibliothèque d'icônes dans le dépôt). Sous-textes basés UNIQUEMENT sur ce que
 * Sprint 19/20 livrent réellement (vérifié dans `microsoft-graph.adapter.ts`/
 * `google-workspace.adapter.ts` : SharePoint+OneDrive+Calendar / Drive+Calendar — jamais
 * Teams/Outlook/Gmail, différés). n8n/Make : jamais "natif" (mission §26/§27, aucun node/app
 * TenderOS publié dans leurs catalogues respectifs) — "compatible via API & Webhooks" uniquement.
 */
const INTEGRATIONS: readonly Integration[] = [
  {
    name: "Microsoft 365",
    subtitle: "SharePoint, OneDrive & Calendrier",
    icon: (
      <>
        <rect x="2" y="2" width="9" height="9" fill="#F25022" />
        <rect x="13" y="2" width="9" height="9" fill="#7FBA00" />
        <rect x="2" y="13" width="9" height="9" fill="#00A4EF" />
        <rect x="13" y="13" width="9" height="9" fill="#FFB900" />
      </>
    ),
  },
  {
    name: "Google Workspace",
    subtitle: "Google Drive & Calendrier",
    icon: (
      <>
        <circle cx="12" cy="6" r="4" fill="#EA4335" />
        <circle cx="18.5" cy="16" r="4" fill="#4285F4" />
        <circle cx="5.5" cy="16" r="4" fill="#FBBC05" />
        <circle cx="12" cy="14" r="3.2" fill="#34A853" />
      </>
    ),
  },
  {
    name: "API publique",
    subtitle: "Connectez TenderOS à votre SI.",
    badge: "Entreprise",
    icon: <path d="M8 6L2 12l6 6M16 6l6 6-6 6M14 4l-4 16" stroke="#0A2A5B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    name: "Webhooks",
    subtitle: "Déclenchez vos automatisations à partir des événements TenderOS.",
    badge: "Entreprise",
    icon: (
      <>
        <circle cx="5" cy="6" r="2.6" stroke="#0A2A5B" strokeWidth="1.8" />
        <circle cx="19" cy="6" r="2.6" stroke="#0A2A5B" strokeWidth="1.8" />
        <circle cx="12" cy="19" r="2.6" stroke="#0A2A5B" strokeWidth="1.8" />
        <path d="M7.4 7.2L16.6 7.2M6.5 8.4L11 16.7M17.5 8.4L13 16.7" stroke="#0A2A5B" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    name: "n8n",
    subtitle: "Compatible via API & Webhooks",
    icon: (
      <>
        <circle cx="4.5" cy="12" r="2.5" stroke="#D4AF37" strokeWidth="1.8" />
        <circle cx="19.5" cy="6" r="2.5" stroke="#D4AF37" strokeWidth="1.8" />
        <circle cx="19.5" cy="18" r="2.5" stroke="#D4AF37" strokeWidth="1.8" />
        <path d="M7 12h4a3 3 0 003-3V8M14 15.5a3 3 0 003 3h0" stroke="#D4AF37" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    name: "Make",
    subtitle: "Compatible via API & Webhooks",
    icon: (
      <path
        d="M12 3l1.8 3.6 3.9.5-2.9 2.7.7 3.9-3.5-1.9-3.5 1.9.7-3.9-2.9-2.7 3.9-.5z M12 15v6M9 21h6"
        stroke="#D4AF37"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

export function IntegrationsSection() {
  return (
    <section id="integrations" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h2 className="font-tenderos-display text-center text-3xl font-extrabold text-tenderos-navy">Connecté à vos outils métier</h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-tenderos-slate">Identifiez en un coup d&apos;œil avec quels écosystèmes TenderOS peut interagir.</p>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRATIONS.map((integration) => (
          <div
            key={integration.name}
            className="flex items-start gap-4 rounded-2xl border border-tenderos-navy/10 p-5 transition hover:border-tenderos-navy/20 hover:shadow-md hover:shadow-tenderos-navy/5"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-tenderos-light" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                {integration.icon}
              </svg>
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-tenderos-display text-sm font-bold text-tenderos-navy">{integration.name}</p>
                {integration.badge ? (
                  <span className="rounded-full bg-tenderos-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-tenderos-navy">{integration.badge}</span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-tenderos-slate">{integration.subtitle}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
