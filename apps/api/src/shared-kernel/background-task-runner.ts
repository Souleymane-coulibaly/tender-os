import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.3 — contrat d'arrêt UNIQUE pour tout travail de fond détaché de
 * la pile d'appel HTTP (`setImmediate`), partagé par les cinq `InProcess*Dispatcher` du produit
 * (extraction, analyse, génération, import DCE, base de connaissances, benchmark IA).
 *
 * LE PROBLÈME RÉEL — chaque dispatcher faisait `setImmediate(() => useCase.execute(...).catch(log))`
 * sans AUCUN hook de cycle de vie. Conséquence directe : `app.close()` n'avait aucune prise sur ce
 * travail. Une tâche encore en vol continuait d'écrire dans PostgreSQL après la fin de la requête
 * HTTP — et, en test, après que la fixture ait supprimé ses lignes. D'où les erreurs de fond
 * observées au FULL RUN : `documentExtraction.update()` → "No record was found for an update", et
 * `benchmarkCaseResult.create()` → violation de `benchmark_case_results_run_id_fkey`. Sous SIGTERM
 * en production, le même trou fait perdre silencieusement une extraction ou une génération en cours.
 *
 * LE CONTRAT GARANTI ICI (mission §4) :
 *  1. après `onModuleDestroy`, plus AUCUNE nouvelle tâche n'est acceptée — `run()` devient un no-op
 *     tracé, jamais une exception qui ferait échouer une requête HTTP en cours d'arrêt ;
 *  2. les tâches DÉJÀ en vol sont attendues jusqu'à leur terme (`Promise.allSettled`), donc plus
 *     aucune requête Prisma n'est émise après le retour de `onModuleDestroy` ;
 *  3. Prisma n'est déconnecté qu'ensuite : `PrismaService` est fourni par un module dont les
 *     dispatchers dépendent, et Nest détruit les modules dépendants AVANT leurs dépendances.
 *
 * Ce n'est PAS une file d'attente distribuée (mission Sprint 3 §15 « jamais une architecture
 * distribuée non nécessaire ») : le travail ne survit toujours pas à un crash du process, seule sa
 * terminaison PROPRE est désormais garantie.
 */
@Injectable()
export class BackgroundTaskRunner implements OnModuleDestroy {
  private readonly logger = new Logger(BackgroundTaskRunner.name);
  private readonly inFlight = new Set<Promise<void>>();
  private shuttingDown = false;

  /** Nombre de tâches réellement en vol — exposé pour les preuves déterministes de fermeture. */
  get inFlightCount(): number {
    return this.inFlight.size;
  }

  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  /**
   * Détache `task` de la pile d'appel courante et la suit jusqu'à son terme. `label` n'apparaît que
   * dans les journaux : jamais un identifiant de corrélation métier, jamais de donnée sensible.
   */
  run(label: string, task: () => Promise<void>): void {
    if (this.shuttingDown) {
      // Jamais une exception : l'appelant est une requête HTTP légitime qui n'a aucun moyen de
      // savoir que l'application s'arrête. Refus tracé, jamais silencieux.
      this.logger.warn(`Background task "${label}" was not started: the application is shutting down.`);
      return;
    }

    const promise = new Promise<void>((resolve) => {
      setImmediate(() => {
        task()
          .catch((error: unknown) => {
            this.logger.error(`Unhandled error in background task "${label}": ${error instanceof Error ? error.message : String(error)}`);
          })
          .finally(resolve);
      });
    });

    this.inFlight.add(promise);
    void promise.finally(() => this.inFlight.delete(promise));
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.inFlight.size === 0) return;

    // `allSettled` sur une COPIE : une tâche qui en démarre une autre est déjà refusée par le garde
    // ci-dessus, l'ensemble ne peut donc plus croître pendant l'attente.
    const pending = [...this.inFlight];
    this.logger.log(`Waiting for ${pending.length} in-flight background task(s) before shutdown.`);
    await Promise.allSettled(pending);
  }
}
