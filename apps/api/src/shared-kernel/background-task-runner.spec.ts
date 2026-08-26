import { describe, expect, it } from "vitest";
import { BackgroundTaskRunner } from "./background-task-runner";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.3 (mission §4/§7/§8) — preuve DÉTERMINISTE du contrat d'arrêt,
 * sans aucun `sleep` : chaque tâche est une promesse contrôlée explicitement par le test.
 *
 * Ce que ces tests verrouillent est exactement ce qui manquait au produit : avant ce Checkpoint,
 * `app.close()` n'avait AUCUNE prise sur le travail détaché par `setImmediate`, si bien qu'une
 * extraction ou un run de benchmark encore en vol continuait d'écrire dans PostgreSQL après la
 * fermeture — jusqu'à violer une FK ou tenter d'updater une ligne déjà supprimée.
 */
describe("BackgroundTaskRunner — contrat d'arrêt (Checkpoint TENDEROS-2.1-P2.3-E12.3)", () => {
  it("BLOQUANT — `onModuleDestroy` ne rend la main qu'APRÈS la fin des tâches déjà en vol", async () => {
    const runner = new BackgroundTaskRunner();
    const first = deferred();
    const second = deferred();
    let firstDone = false;
    let secondDone = false;

    runner.run("first", async () => {
      await first.promise;
      firstDone = true;
    });
    runner.run("second", async () => {
      await second.promise;
      secondDone = true;
    });

    // `setImmediate` doit avoir eu lieu pour que les tâches soient réellement démarrées.
    await new Promise((resolve) => setImmediate(resolve));
    expect(runner.inFlightCount).toBe(2);

    let destroyed = false;
    const destroy = runner.onModuleDestroy().then(() => {
      destroyed = true;
    });

    // Tant qu'une seule tâche est terminée, l'arrêt NE doit PAS être considéré comme fini —
    // c'est précisément ce qui laissait des écritures Prisma s'échapper après la fermeture.
    first.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    expect(destroyed).toBe(false);

    second.resolve();
    await destroy;

    expect(destroyed).toBe(true);
    expect(firstDone).toBe(true);
    expect(secondDone).toBe(true);
    expect(runner.inFlightCount).toBe(0);
  });

  it("BLOQUANT — aucune NOUVELLE tâche n'est acceptée une fois l'arrêt entamé (jamais une écriture post-shutdown)", async () => {
    const runner = new BackgroundTaskRunner();
    await runner.onModuleDestroy();

    let started = false;
    runner.run("post-shutdown", async () => {
      started = true;
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(started).toBe(false);
    expect(runner.inFlightCount).toBe(0);
    expect(runner.isShuttingDown).toBe(true);
  });

  it("un refus d'exécution ne lève JAMAIS : une requête HTTP légitime ne doit pas échouer parce que l'application s'arrête", () => {
    const runner = new BackgroundTaskRunner();
    void runner.onModuleDestroy();

    expect(() => runner.run("refused", async () => undefined)).not.toThrow();
  });

  it("une tâche qui échoue est journalisée sans jamais faire échouer l'arrêt ni les tâches voisines", async () => {
    const runner = new BackgroundTaskRunner();
    let siblingDone = false;

    runner.run("failing", async () => {
      throw new Error("boom");
    });
    runner.run("sibling", async () => {
      siblingDone = true;
    });

    await expect(runner.onModuleDestroy()).resolves.toBeUndefined();
    expect(siblingDone).toBe(true);
    expect(runner.inFlightCount).toBe(0);
  });

  it("`onModuleDestroy` est idempotent — une seconde fermeture ne bloque jamais", async () => {
    const runner = new BackgroundTaskRunner();
    await runner.onModuleDestroy();
    await expect(runner.onModuleDestroy()).resolves.toBeUndefined();
  });
});
