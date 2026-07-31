export const AiModelStatus = {
  Enabled: "ENABLED",
  Disabled: "DISABLED",
} as const;

export type AiModelStatus = (typeof AiModelStatus)[keyof typeof AiModelStatus];

export function isAiModelStatus(value: string): value is AiModelStatus {
  return Object.values(AiModelStatus).includes(value as AiModelStatus);
}
