/**
 * Infra-owned persistence errors for the MessageTemplate catalog (todo 3).
 *
 * Lives in infrastructure (NOT domain): todo-2 domain files are frozen,
 * and uniqueness is a repository concern (partial unique indexes). Same
 * `code`/`details` shape as the domain `MessageTemplateValidationError`
 * so todo-6 can map it to HTTP 409 (never a raw 500).
 *
 * Covers BOTH unique paths:
 * - duplicate `(command, name)` lookup key.
 * - concurrent-activate race on the partial `UNIQUE(command) WHERE
 *   is_active` index (exactly one winner; losers land here).
 */
export class MessageTemplateDuplicateError extends Error {
  public readonly code = 'MESSAGE_TEMPLATE_DUPLICATE';
  public readonly details?: unknown;

  public constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'MessageTemplateDuplicateError';
    this.details = details;
  }
}
