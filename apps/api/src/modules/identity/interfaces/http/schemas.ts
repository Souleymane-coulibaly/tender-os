import { z } from "zod";

/** V2 Sprint 24 (onboarding, CGU) — première ligne de contrôle : `!== true` est refusé avec le
 *  message exact requis par la mission, jamais un booléen silencieusement accepté à `false`.
 *  `RegisterUserUseCase` revérifie en défense en profondeur (jamais une seule couche pour un
 *  invariant légal/RGPD). Volontairement PAS le même contrôle que le consentement Analytics/
 *  Crisp/marketing (cookies) : accepter/refuser ce dernier ne bloque jamais la création de compte,
 *  seule l'acceptation des CGU est un pré-requis bloquant ici. */
const termsAcceptedSchema = z.boolean().refine((value) => value === true, {
  message: "Vous devez accepter les Conditions Générales d'Utilisation pour continuer.",
});

export const RegisterBodySchema = z
  .object({
    email: z.string().trim().min(3).max(320),
    password: z.string().min(8).max(200),
    displayName: z.string().trim().min(1).max(160),
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    termsAccepted: termsAcceptedSchema,
  })
  .strict();

export type RegisterBody = z.infer<typeof RegisterBodySchema>;

export const LoginBodySchema = z
  .object({
    email: z.string().trim().min(1).max(320),
    password: z.string().min(1).max(200),
  })
  .strict();

export type LoginBody = z.infer<typeof LoginBodySchema>;

/** V2 Sprint 24 (onboarding, flow "Mot de passe oublié") — `email` volontairement permissif
 *  (comme `LoginBodySchema`, jamais `RegisterBodySchema`'s `min(3)`) : une entrée syntaxiquement
 *  invalide doit tout de même aboutir à la même réponse anti-énumération, jamais une erreur de
 *  validation qui la distinguerait. */
export const RequestPasswordResetBodySchema = z
  .object({
    email: z.string().trim().min(1).max(320),
  })
  .strict();

export type RequestPasswordResetBody = z.infer<typeof RequestPasswordResetBodySchema>;

export const ResetPasswordBodySchema = z
  .object({
    token: z.string().trim().min(1).max(500),
    newPassword: z.string().min(8).max(200),
  })
  .strict();

export type ResetPasswordBody = z.infer<typeof ResetPasswordBodySchema>;

/** V2 Sprint 25 (Guide interactif) — mission §25.72/§25.83. */
export const UpdateTourStateBodySchema = z
  .object({
    action: z.enum(["START", "COMPLETE", "DISMISS"]),
  })
  .strict();

export type UpdateTourStateBody = z.infer<typeof UpdateTourStateBodySchema>;
