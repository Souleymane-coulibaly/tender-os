import { CardSkeleton } from "../../../components/ui/skeleton";

/**
 * V2 Sprint 25F (homogénéisation UX/UI) — mission §25F.75 "éliminer les écrans blancs pendant le
 * chargement". Fallback Suspense générique pour toute navigation entre routes `/app/*` (le chrome
 * de `layout.tsx`/`AppShell` reste monté, seul le contenu de la page est remplacé le temps du
 * chargement) — un squelette générique plutôt qu'un texte "Chargement..." qui ne dit rien de la
 * structure à venir.
 */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-4">
      <CardSkeleton />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
