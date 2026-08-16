import { main } from "./compliance-probe";

/**
 * Point d'entrée CLI SÉPARÉ de `compliance-probe.ts` (mission — jamais d'effet de bord au niveau
 * module dans le fichier qui exporte les fonctions pures/testables) : `compliance-probe.spec.ts`
 * importe `compliance-probe.ts` sans jamais déclencher un appel réseau réel ; seul CE fichier,
 * pointé par `pnpm --filter @tenderos/api eval:compliance`, exécute réellement `main()`.
 */
void main();
