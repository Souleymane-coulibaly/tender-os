/**
 * L'application refuse de démarrer si une configuration critique est invalide
 * (skills/platform-foundation/SKILL.md §38, skills/platform-foundation/DEPLOYMENT_PATTERNS.md §11).
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
