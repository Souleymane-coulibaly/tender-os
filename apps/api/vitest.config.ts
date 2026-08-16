import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    root: "./",
    // Consolidation IA — Checkpoint C : `scripts/*.spec.ts` couvre les fonctions pures/testables des
    // scripts opérationnels autonomes (même motif que `prisma/*.ts`, hors de `src/`) — aucun appel
    // réseau réel dans ces tests (fetch stubbed, voir `scripts/compliance-probe.spec.ts`).
    include: ["src/**/*.spec.ts", "scripts/**/*.spec.ts"],
    environment: "node",
    // Correctif audit Sprint 18 — chaque spec d'intégration boote son propre `AppModule` complet
    // (`Test.createTestingModule`), donc ses propres workers à minuteur réel (Outbox, livraison
    // webhook, alertes email, sync sources marché). Sous exécution concurrente (~50 fichiers), ces
    // pollers indépendants se disputent les mêmes lignes en base, causant une instabilité de suite
    // sans rapport avec la correction fonctionnelle testée. Désactivés par défaut ici : chaque test
    // qui dépend d'un effet piloté par l'un de ces workers appelle déjà `.tick()` explicitement
    // (motif établi de longue date, jamais une dépendance au minuteur réel).
    env: {
      OUTBOX_WORKER_ENABLED: "false",
      WEBHOOK_DELIVERY_WORKER_ENABLED: "false",
      EMAIL_ALERT_WORKER_ENABLED: "false",
      MARKET_SOURCE_SYNC_WORKER_ENABLED: "false",
    },
  },
});
