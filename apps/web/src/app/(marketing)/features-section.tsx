const FEATURES = [
  {
    title: "Veille & Opportunités",
    description: "Identifiez les appels d'offres pertinents et concentrez vos équipes sur les meilleures opportunités.",
    icon: (
      <path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    title: "Dossier de réponse",
    description: "Centralisez DCE, documents, exigences, lots et versions dans un espace structuré.",
    icon: <path d="M4 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" stroke="#1472FF" strokeWidth="1.8" strokeLinejoin="round" />,
  },
  {
    title: "IA & Analyse DCE",
    description: "Analysez les pièces, extrayez les exigences et accélérez la compréhension du dossier.",
    icon: <path d="M12 3l2 4 4 .5-3 3 .8 4.5L12 13l-3.8 2 .8-4.5-3-3 4-.5z" stroke="#D4AF37" strokeWidth="1.8" strokeLinejoin="round" />,
  },
  {
    title: "Collaboration",
    description: "Travaillez à plusieurs, assignez, commentez et pilotez les validations.",
    icon: (
      <path d="M8 11a3 3 0 100-6 3 3 0 000 6zM17 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M13 15c2.5 0 6 2 6 5" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    title: "Chiffrage & Documents",
    description: "Préparez mémoires techniques, pièces administratives, BPU, DPGF et DQE.",
    icon: <path d="M9 2h6l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zM9 13h6M9 17h6M9 9h2" stroke="#1472FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    title: "Package final & Intégrations",
    description: "Finalisez votre dossier et connectez TenderOS à vos outils métier.",
    icon: <path d="M12 2l2.5 5 5.5.8-4 3.9.9 5.5L12 14.7 7.1 17.2l.9-5.5-4-3.9 5.5-.8z" stroke="#D4AF37" strokeWidth="1.8" strokeLinejoin="round" />,
  },
] as const;

export function FeaturesSection() {
  return (
    <section id="fonctionnalites" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h2 className="font-tenderos-display text-center text-3xl font-extrabold text-tenderos-navy">Tout ce qu&apos;il vous faut pour répondre mieux</h2>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="rounded-2xl border border-tenderos-navy/10 p-6 transition hover:shadow-lg hover:shadow-tenderos-navy/5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tenderos-light">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                {feature.icon}
              </svg>
            </div>
            <h3 className="font-tenderos-display mt-4 text-base font-bold text-tenderos-navy">{feature.title}</h3>
            <p className="mt-2 text-sm text-tenderos-slate">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
