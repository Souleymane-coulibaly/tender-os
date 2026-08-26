"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../../components/ui";
import { markAllNotificationsReadAction } from "../../notifications-actions";

export function MarkAllReadButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleClick} loading={isPending}>
      Tout marquer comme lu
    </Button>
  );
}
