"use client";

import { useState, useTransition } from "react";
import { Card, Switch } from "../../../../components/ui";
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_DESCRIPTIONS, NOTIFICATION_CATEGORY_LABELS, type NotificationCategoryId, type NotificationPreferenceSummary } from "../../../../lib/notification-types";
import { updateNotificationPreferenceAction } from "../../notifications-actions";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E11, mission §20 — l'in-app reste TOUJOURS actif (jamais un toggle,
 * mission §22 "ne pas désactiver silencieusement une notification in-app critique") : seul l'email
 * par catégorie est configurable ici. Optimiste (bascule immédiate) avec retour arrière si le
 * backend refuse — le backend reste autoritaire (mission §21), jamais un état purement local qui
 * divergerait silencieusement.
 */
export function NotificationPreferencesCard({ initialPreferences }: { initialPreferences: NotificationPreferenceSummary[] }) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function handleToggle(category: NotificationCategoryId, emailEnabled: boolean) {
    setError(undefined);
    const previous = preferences;
    setPreferences((current) => current.map((p) => (p.category === category ? { ...p, emailEnabled } : p)));
    startTransition(async () => {
      const result = await updateNotificationPreferenceAction(category, emailEnabled);
      if (result.error) {
        setPreferences(previous);
        setError(result.error);
      }
    });
  }

  return (
    <Card title="Préférences de notification" description="L'application reste toujours informée. Choisissez ce qui mérite en plus un email.">
      <div className="flex flex-col gap-4">
        {NOTIFICATION_CATEGORIES.map((category) => {
          const preference = preferences.find((p) => p.category === category);
          return (
            <div key={category} className="flex flex-col gap-2 border-b border-tenderos-navy/5 pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-tenderos-navy">{NOTIFICATION_CATEGORY_LABELS[category]}</p>
                <p className="text-xs text-tenderos-slate">{NOTIFICATION_CATEGORY_DESCRIPTIONS[category]}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-tenderos-slate">Dans l&apos;application : toujours actif</span>
                <Switch
                  label="Email"
                  checked={preference?.emailEnabled ?? true}
                  disabled={isPending}
                  onChange={(event) => handleToggle(category, event.target.checked)}
                />
              </div>
            </div>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
