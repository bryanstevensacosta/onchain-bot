/**
 * Symbol tokens used in the publishing BC.
 *
 * Kept in a separate file to avoid circular imports between
 * `publishing.module.ts` and `publish-approved-call.use-case.ts`.
 */
export const MESSAGE_FORMATTER = Symbol('MESSAGE_FORMATTER');
