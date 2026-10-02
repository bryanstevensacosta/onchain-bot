/**
 * Dexter message-template views (Wave 1 Lane A).
 *
 * Mirrors the backend contracts verbatim:
 * - `MessageTemplateView` from
 *   `apps/dexter-onchain-bot/src/templates/api/http/message-templates.controller.ts`
 *   (`id, command, name, bodyMarkdown, isActive, version, createdAt, updatedAt`).
 *   Dates travel as ISO strings over HTTP (backend `Date` → JSON).
 * - `DisplayMapView` from `display-maps.controller.ts`
 *   (`id, placeholderKey, matchValue, display, createdAt`) — wire field
 *   is `display` (NOT `emoji`); derived key `{{chainDisplay}}`.
 * - `PlaceholderInfo` from `placeholders.controller.ts`
 *   (`PlaceholdersView{command, placeholders: PlaceholderDescriptor[]}`).
 * - `PreviewResult` from `preview-template.use-case.ts`
 *   (`PreviewTemplateResult` + `PreviewUnresolvedShape`).
 */

export interface MessageTemplateView {
  readonly id: string;
  readonly command: string;
  readonly name: string;
  readonly bodyMarkdown: string;
  readonly isActive: boolean;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DisplayMapView {
  readonly id: string;
  readonly placeholderKey: string;
  readonly matchValue: string;
  readonly display: string;
  readonly createdAt: string;
}

export interface PlaceholderInfo {
  readonly key: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly example: string;
}

export interface PlaceholdersView {
  readonly command: string;
  readonly placeholders: ReadonlyArray<PlaceholderInfo>;
}

export interface PreviewResult {
  readonly text: string;
  readonly truncated: boolean;
  readonly parseMode: 'MarkdownV2';
  readonly placeholdersUsed: ReadonlyArray<string>;
  readonly unknown: ReadonlyArray<string>;
}

/** Pipeline error shapes, propagated verbatim (same bodies as `GET /dexter/token`). */
export interface PreviewUnresolved {
  readonly error: string;
  readonly address: string;
  readonly candidates?: ReadonlyArray<string>;
}

export type PreviewTemplateOutput = PreviewResult | PreviewUnresolved;

/** Type guard: previews that failed to resolve carry `error` instead of `text`. */
export function isPreviewUnresolved(
  output: PreviewTemplateOutput,
): output is PreviewUnresolved {
  return 'error' in output;
}

export interface CreateMessageTemplateBody {
  readonly command: string;
  readonly name: string;
  readonly bodyMarkdown: string;
}

/**
 * Update body: `command` is IMMUTABLE after creation (backend PATCH
 * rejects it with 400), so it is deliberately absent here — rename or
 * re-body only.
 */
export interface UpdateMessageTemplateBody {
  readonly name?: string;
  readonly bodyMarkdown?: string;
}

export interface PreviewDraftBody {
  readonly command: string;
  readonly bodyMarkdown: string;
}

/**
 * Preview request: `templateId` XOR `draft` + `address`
 * (+ `timeframe` for c/cc only). Both/neither → 400.
 */
export interface PreviewTemplateBody {
  readonly templateId?: string;
  readonly draft?: PreviewDraftBody;
  readonly address: string;
  readonly timeframe?: string;
}

export interface CreateDisplayMapBody {
  readonly placeholderKey: string;
  readonly matchValue: string;
  readonly display: string;
}

/**
 * Update body: `placeholderKey` is the immutable pair key (backend
 * PATCH has no such field), so it is deliberately absent here.
 */
export interface UpdateDisplayMapBody {
  readonly matchValue?: string;
  readonly display?: string;
}
