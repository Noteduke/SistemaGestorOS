const DATABASE_URL_PATTERN = /\b(?:mysql|mariadb):\/\/[^\s"'`<>]+/giu;
const PASSWORD_ASSIGNMENT_PATTERN = /\b(password|passwd|pwd)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/giu;

export function safeDiagnosticMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  return message
    .replace(DATABASE_URL_PATTERN, "[URL do banco redigida]")
    .replace(PASSWORD_ASSIGNMENT_PATTERN, "$1$2[REDACTED]");
}
