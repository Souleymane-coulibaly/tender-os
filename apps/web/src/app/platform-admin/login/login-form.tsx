"use client";

import { useActionState } from "react";
import { Button, Input } from "../../../components/ui";
import { loginAction, type LoginActionState } from "../actions";

const INITIAL_STATE: LoginActionState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <Input label="Email" id="email" name="email" type="email" required autoComplete="username" />

      <Input label="Mot de passe" id="password" name="password" type="password" required autoComplete="current-password" />

      {state.error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Connexion..." : "Se connecter"}
      </Button>
    </form>
  );
}
