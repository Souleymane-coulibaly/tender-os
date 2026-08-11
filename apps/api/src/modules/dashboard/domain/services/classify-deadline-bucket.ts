import { DeadlineBucket } from "../enums";

/** UTC (jamais la timezone locale du process) — déterministe indépendamment du fuseau serveur. */
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Mission §27/§28/§29 — la deadline source est TOUJOURS `Tender.submissionDeadline` (jamais
 * recalculée depuis un texte IA), classée en jours civils À PARTIR DE `now` (limitation connue :
 * frontière UTC serveur, pas la timezone propre du Tender — `TenderListItemDto` n'expose pas
 * `submissionDeadlineTimezone` aujourd'hui, voir rapport Sprint 15 §"risques résiduels"). Règle
 * déterministe, jamais une IA.
 */
export function classifyDeadlineBucket(deadline: Date, now: Date): DeadlineBucket {
  if (deadline.getTime() < now.getTime()) {
    return DeadlineBucket.Overdue;
  }

  const todayStart = startOfUtcDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const dayAfterTomorrowStart = addDays(todayStart, 2);
  const nextWeekStart = addDays(todayStart, 7);

  if (deadline.getTime() < tomorrowStart.getTime()) {
    return DeadlineBucket.Today;
  }
  if (deadline.getTime() < dayAfterTomorrowStart.getTime()) {
    return DeadlineBucket.Tomorrow;
  }
  if (deadline.getTime() < nextWeekStart.getTime()) {
    return DeadlineBucket.ThisWeek;
  }
  return DeadlineBucket.Later;
}
