/**
 * Exécute `tasks` avec une concurrence bornée (Sprint 5.2 §"Éviter... une concurrence non bornée")
 * — jamais `Promise.all` brut sur l'ensemble des tâches, qui ouvrirait autant d'appels provider
 * simultanés que de tâches. Chaque tâche gère elle-même ses propres erreurs (jamais un `throw` qui
 * romprait les tâches restantes) : ce runner ne fait qu'ordonnancer, jamais de logique métier.
 */
export async function runWithConcurrencyLimit<T>(
  tasks: readonly (() => Promise<T>)[],
  concurrencyLimit: number,
  shouldStop?: () => Promise<boolean> | boolean,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      if (shouldStop && (await shouldStop())) return;
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await tasks[currentIndex]!();
    }
  }

  const workerCount = Math.min(Math.max(1, concurrencyLimit), tasks.length || 1);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
