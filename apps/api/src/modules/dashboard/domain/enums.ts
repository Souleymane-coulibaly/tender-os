/** Mission §29 — classification déterministe de l'urgence d'une échéance, jamais une IA. Regroupe
 *  aussi le découpage du widget "Échéances" (mission §27 "Aujourd'hui / Demain / Cette semaine /
 *  Plus tard") : un seul axe plutôt que deux taxonomies parallèles — OVERDUE/TODAY couvrent
 *  l'urgence "< 24h", TOMORROW/THIS_WEEK couvrent "< 3j"/"< 7j" (voir `classifyDeadlineBucket`). */
export const DeadlineBucket = {
  Overdue: "OVERDUE",
  Today: "TODAY",
  Tomorrow: "TOMORROW",
  ThisWeek: "THIS_WEEK",
  Later: "LATER",
} as const;
export type DeadlineBucket = (typeof DeadlineBucket)[keyof typeof DeadlineBucket];

/** Mission §30/§31 — catalogue fermé et déterministe (deadline + blocking issues + workflow
 *  status), jamais un score IA opaque. Un Tender peut porter plusieurs raisons simultanément. */
export const AttentionReason = {
  DeadlineOverdue: "DEADLINE_OVERDUE",
  DeadlineUrgent: "DEADLINE_URGENT",
  ChecklistIncomplete: "CHECKLIST_INCOMPLETE",
  PackageNotReady: "PACKAGE_NOT_READY",
  ReadinessAtRisk: "READINESS_AT_RISK",
} as const;
export type AttentionReason = (typeof AttentionReason)[keyof typeof AttentionReason];
