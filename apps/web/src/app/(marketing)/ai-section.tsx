const AI_CAPABILITIES = [
  "Analyse DCE",
  "Extraction des exigences",
  "Suggestions",
  "Mémoire technique",
  "Bibliothèque intelligente",
  "Chat IA contextualisé",
] as const;

/**
 * V2 Sprint 23 (landing) — mission §15 : "ne jamais présenter TenderOS comme prenant
 * automatiquement la décision finale à la place de l'utilisateur" — la mention "Validation humaine
 * conservée" est structurelle ici, jamais une note en petit caractère reléguée en bas.
 */
export function AiSection() {
  return (
    <section className="bg-tenderos-navy py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="font-tenderos-display text-3xl font-extrabold text-white">Une IA qui travaille avec votre dossier</h2>
            <p className="mt-4 text-white/70">
              TenderOS mobilise l&apos;intelligence artificielle à chaque étape de votre réponse — sans jamais décider à votre place.
            </p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-tenderos-gold-light">
              ✓ Validation humaine conservée
            </p>
          </div>

          <ul className="grid grid-cols-2 gap-3">
            {AI_CAPABILITIES.map((capability) => (
              <li key={capability} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white">
                {capability}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
