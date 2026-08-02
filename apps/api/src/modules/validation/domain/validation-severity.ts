export const ValidationSeverity = {
  Blocking: "BLOCKING",
  Warning: "WARNING",
} as const;

export type ValidationSeverity = (typeof ValidationSeverity)[keyof typeof ValidationSeverity];
