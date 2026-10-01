/**
 * Access-audit helper (sec1 T3).
 *
 * ONE structured line per auth decision (allow/deny). Query strings are
 * ALWAYS stripped before logging — the legacy `?apiKey=` transport must
 * never reach a log line. Key values are never accepted as input at all,
 * so redaction is structural, not string-matching.
 */

export type AccessDecision = 'allow' | 'deny';

export interface AccessAuditFields {
  method: string;
  /** Path WITHOUT query string — callers must pass stripQueryForAudit() output. */
  path: string;
  decision: AccessDecision;
  guard: string;
  clientIp: string;
  note?: string;
}

/** Strip `?...` so `?apiKey=` values can never be logged. */
export function stripQueryForAudit(rawPath: string): string {
  return (rawPath.split('?')[0] ?? rawPath) || '/';
}

/** Build the structured audit payload (no key material by construction). */
export function buildAccessAuditLine(
  fields: AccessAuditFields,
): Record<string, string> {
  const line: Record<string, string> = {
    event: 'auth:access:decision',
    method: fields.method.toUpperCase(),
    path: stripQueryForAudit(fields.path),
    decision: fields.decision,
    guard: fields.guard,
    clientIp: fields.clientIp,
    timestamp: new Date().toISOString(),
  };
  if (fields.note) {
    line['note'] = fields.note;
  }
  return line;
}
