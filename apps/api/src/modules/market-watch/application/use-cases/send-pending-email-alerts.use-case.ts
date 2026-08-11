import { Inject, Injectable, Logger } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { GetCurrentUserUseCase } from "../../../identity";
import { EMAIL_ALERT_STALE_CLAIM_THRESHOLD_MS, EmailFrequency } from "../../domain/enums";
import type { ExternalTender } from "../../domain/external-tender.entity";
import type { SavedSearchMatch } from "../../domain/saved-search-match.entity";
import { buildDailyDigestEmail, buildImmediateMatchEmail, type EmailAlertItem } from "../services/email-alert-templates";
import { EMAIL_PROVIDER, type EmailProvider } from "../ports/email-provider";
import { EXTERNAL_TENDER_REPOSITORY, type ExternalTenderRepository } from "../ports/external-tender.repository";
import { SAVED_SEARCH_REPOSITORY, type SavedSearchRepository } from "../ports/saved-search.repository";
import { SAVED_SEARCH_MATCH_REPOSITORY, type SavedSearchMatchRepository } from "../ports/saved-search-match.repository";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SendPendingEmailAlertsInput = Readonly<{ organizationId?: string | undefined; batchSize: number; baseUrl: string }>;
export type SendPendingEmailAlertsResult = Readonly<{ sent: number; failed: number; digestsSent: number }>;

function toEmailAlertItem(tender: ExternalTender, match: SavedSearchMatch): EmailAlertItem {
  return { tenderId: tender.id, tenderTitle: tender.title, buyerName: tender.buyerName, deadline: tender.submissionDeadline, score: match.score, matchReasonLabels: match.matchReasons.map((r) => r.label) };
}

/**
 * Mission §66/§67/§43 — jamais dans la transaction de matching (appelé par
 * `EmailAlertWorker`, poll périodique distinct). Regroupe par SavedSearch : IMMEDIATE envoie
 * chaque match dès qu'il est PENDING, DAILY_DIGEST accumule et n'envoie qu'une fois toutes les 24h
 * (mission §111 idempotence — jamais un match déjà inclus dans un digest précédent renvoyé).
 * Une préférence email désactivée depuis la création du match laisse celui-ci PENDING pour
 * toujours (jamais envoyé, jamais compté en échec) — cohérent avec mission §127/§129.
 */
@Injectable()
export class SendPendingEmailAlertsUseCase {
  private readonly logger = new Logger(SendPendingEmailAlertsUseCase.name);

  constructor(
    @Inject(SAVED_SEARCH_MATCH_REPOSITORY) private readonly matchRepository: SavedSearchMatchRepository,
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly savedSearchRepository: SavedSearchRepository,
    @Inject(EXTERNAL_TENDER_REPOSITORY) private readonly externalTenderRepository: ExternalTenderRepository,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
  ) {}

  async execute(input: SendPendingEmailAlertsInput): Promise<SendPendingEmailAlertsResult> {
    const now = this.clock.now();
    // Correctif audit P1-001 — CLAIM atomique (jamais une simple lecture) : sans lui, deux workers
    // (ou deux ticks qui se chevauchent) pouvaient lire le même match PENDING et envoyer deux
    // emails au même utilisateur.
    const pending = await this.matchRepository.claimPendingEmailBatch({ organizationId: input.organizationId, limit: input.batchSize, now, staleClaimThresholdMs: EMAIL_ALERT_STALE_CLAIM_THRESHOLD_MS });

    const bySavedSearch = new Map<string, SavedSearchMatch[]>();
    for (const match of pending) {
      const list = bySavedSearch.get(match.savedSearchId) ?? [];
      list.push(match);
      bySavedSearch.set(match.savedSearchId, list);
    }

    let sent = 0;
    let failed = 0;
    let digestsSent = 0;

    for (const [savedSearchId, matches] of bySavedSearch) {
      const organizationId = matches[0]!.organizationId;
      const savedSearch = await this.savedSearchRepository.findById({ organizationId, savedSearchId });
      // Mission §127/§129 — préférence désactivée/veille inactive entre-temps : jamais envoyé,
      // reste PENDING indéfiniment (jamais compté en échec, ce n'est pas une erreur). Correctif
      // audit P1-001 — le claim atomique a déjà basculé ces matches en SENDING sans connaître cette
      // préférence : il faut explicitement les relâcher vers PENDING, sinon ils restent bloqués en
      // SENDING pour toujours (jamais réclamables par un tick futur, même une fois la préférence
      // réactivée).
      if (!savedSearch || !savedSearch.alertEmail || !savedSearch.isActive) {
        await this.releaseClaims(matches, now);
        continue;
      }

      if (savedSearch.emailFrequency === EmailFrequency.Immediate) {
        for (const match of matches) {
          const tender = await this.externalTenderRepository.findById({ organizationId, externalTenderId: match.externalTenderId });
          if (!tender) {
            await this.releaseClaims([match], now);
            continue;
          }
          const outcome = await this.sendOne(savedSearch.ownerUserId, buildImmediateMatchEmail({ savedSearchName: savedSearch.name, item: toEmailAlertItem(tender, match), baseUrl: input.baseUrl }));
          if (outcome.ok) {
            match.markEmailSent(now);
            sent += 1;
          } else {
            match.recordEmailFailure({ error: outcome.error, occurredAt: now });
            failed += 1;
          }
          await this.matchRepository.save(match);
        }
        continue;
      }

      // DAILY_DIGEST
      const dueForDigest = !savedSearch.lastDigestSentAt || now.getTime() - savedSearch.lastDigestSentAt.getTime() >= DAY_MS;
      if (!dueForDigest) {
        // Correctif audit P1-001 — digest pas encore dû : relâcher le claim, jamais laisser ces
        // matches bloqués en SENDING jusqu'à la prochaine fenêtre de 24h.
        await this.releaseClaims(matches, now);
        continue;
      }

      const items: { match: SavedSearchMatch; tender: ExternalTender }[] = [];
      const orphaned: SavedSearchMatch[] = [];
      for (const match of matches) {
        const tender = await this.externalTenderRepository.findById({ organizationId, externalTenderId: match.externalTenderId });
        if (tender) items.push({ match, tender });
        else orphaned.push(match);
      }
      await this.releaseClaims(orphaned, now);
      if (items.length === 0) continue;

      const outcome = await this.sendOne(
        savedSearch.ownerUserId,
        buildDailyDigestEmail({ savedSearchName: savedSearch.name, items: items.map(({ match, tender }) => toEmailAlertItem(tender, match)), baseUrl: input.baseUrl }),
      );

      for (const { match } of items) {
        if (outcome.ok) {
          match.markEmailSent(now);
        } else {
          match.recordEmailFailure({ error: outcome.error, occurredAt: now });
        }
        await this.matchRepository.save(match);
      }

      if (outcome.ok) {
        savedSearch.recordDigestSent(now);
        await this.savedSearchRepository.save(savedSearch);
        sent += items.length;
        digestsSent += 1;
      } else {
        failed += items.length;
      }
    }

    if (sent > 0 || failed > 0) {
      this.logger.log(`Email alert tick: sent=${sent} failed=${failed} digests=${digestsSent}`);
    }

    return { sent, failed, digestsSent };
  }

  /** Correctif audit P1-001 — relâche un claim qui ne débouchera finalement sur aucun envoi (SENDING
   *  -> PENDING), jamais un compteur de tentative incrémenté : ce n'est pas un échec d'envoi. */
  private async releaseClaims(matches: readonly SavedSearchMatch[], now: Date): Promise<void> {
    for (const match of matches) {
      match.releaseSendingClaim(now);
      await this.matchRepository.save(match);
    }
  }

  private async sendOne(ownerUserId: string, message: { subject: string; html: string; text: string }): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const user = await this.getCurrentUserUseCase.execute({ userId: ownerUserId });
      // Mission §75 — jamais une adresse fournie par le frontend : toujours résolue depuis le
      // compte utilisateur autorisé (`GetCurrentUserUseCase`), jamais un paramètre arbitraire.
      await this.emailProvider.send({ ...message, to: user.email });
      return { ok: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Email alert send failed for user ${ownerUserId}: ${errorMessage}`);
      return { ok: false, error: errorMessage };
    }
  }
}
