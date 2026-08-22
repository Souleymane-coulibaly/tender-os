import { Inject, Injectable } from "@nestjs/common";
import { ListAccessibleClientsUseCase } from "../../../client-portfolio";
import { TenderPermission } from "../../domain/tender-permission";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type GetTenderActivityTrendQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  clientAccountId?: string | undefined;
  /** Toujours 7, 30 ou 90 — même contrat que `periodDays` du Dashboard (mission §5 addendum
   *  "ne pas créer plusieurs définitions métier selon la période"), validé côté HTTP appelant. */
  periodDays: number;
  /** IANA timezone de l'organisation (`Organization.defaultTimezone`) — le bucketing "par jour"
   *  respecte TOUJOURS ce fuseau (mission §32 "ne pas supposer Europe/Paris"), jamais UTC serveur. */
  timezone: string;
  now: Date;
}>;

export type TenderActivityTrendPointDto = Readonly<{ date: string; count: number }>;

/** Borne défensive au-delà de laquelle le résultat devient une approximation sur l'échantillon
 *  chargé — même discipline documentée que `MAX_TENDERS_FOR_RISK_AND_AVERAGE` dans
 *  `GetTenderStatisticsUseCase` (à revisiter avec une agrégation SQL dédiée si un tenant dépasse ce
 *  volume de créations sur la période). */
const MAX_TENDERS_FOR_TREND = 5000;

function dayKeyInTimezone(date: Date, timezone: string): string {
  // "en-CA" produit nativement le format YYYY-MM-DD (Intl.DateTimeFormat), jamais un parsing
  // manuel de chaîne fragile — la timezone est appliquée par l'environnement d'exécution (ICU),
  // jamais une hypothèse d'offset fixe (DST-safe).
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2, Premium Analytics addendum §4/§26) — graphique
 * principal "Activité des appels d'offres" : UNE série fiable et exacte (nombre d'AO créés par
 * jour), jamais une série "AO analysés/GO/déposés" fabriquée sans SOT correspondante fiable
 * (mission "préférer moins d'étapes mais exactes"). Zéro décision métier — un pur comptage borné
 * par date, day-bucketé dans le fuseau horaire réel de l'organisation.
 */
@Injectable()
export class GetTenderActivityTrendUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    private readonly listAccessibleClientsUseCase: ListAccessibleClientsUseCase,
  ) {}

  async execute(query: GetTenderActivityTrendQuery): Promise<readonly TenderActivityTrendPointDto[]> {
    assertHasTenderPermission(query.actorRole, TenderPermission.List);

    const accessible = await this.listAccessibleClientsUseCase.execute(query);
    let restrictToClientAccountIds: readonly string[] | undefined;
    if (query.clientAccountId) {
      const authorized = accessible.allClients || accessible.clientAccountIds.includes(query.clientAccountId);
      restrictToClientAccountIds = authorized ? [query.clientAccountId] : [];
    } else {
      restrictToClientAccountIds = accessible.allClients ? undefined : accessible.clientAccountIds;
    }

    if (!accessible.allClients && accessible.clientAccountIds.length === 0) {
      restrictToClientAccountIds = [];
    }

    const since = new Date(query.now.getTime() - query.periodDays * 24 * 60 * 60 * 1000);
    const timestamps =
      restrictToClientAccountIds && restrictToClientAccountIds.length === 0
        ? []
        : await this.tenderRepository.listCreatedAtSince({ organizationId: query.organizationId, restrictToClientAccountIds, since, limit: MAX_TENDERS_FOR_TREND });

    const countByDay = new Map<string, number>();
    for (const timestamp of timestamps) {
      const key = dayKeyInTimezone(timestamp, query.timezone);
      countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
    }

    // Toujours un point par jour de la période, même à 0 — un graphique de tendance avec des jours
    // manquants (silencieusement absents plutôt que 0) induirait en erreur, jamais une donnée omise.
    const points: TenderActivityTrendPointDto[] = [];
    for (let offset = query.periodDays - 1; offset >= 0; offset--) {
      const day = new Date(query.now.getTime() - offset * 24 * 60 * 60 * 1000);
      const key = dayKeyInTimezone(day, query.timezone);
      points.push({ date: key, count: countByDay.get(key) ?? 0 });
    }

    return points;
  }
}
