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

/**
 * TYPE-ONLY mirror of the backend `ResolvedToken`
 * (`apps/dexter-onchain-bot/src/scan/domain/ports/scan-pipeline.port.ts`).
 * Required core `address/chain/symbol` (backend 400s otherwise); every
 * other field is optional/nullable (renderer tolerates absent keys as
 * N/A/`""`) so partial snapshots stay JSON-safe. Primitives only — echo
 * the object back verbatim, no (de)serializers needed.
 */
export interface DevWalletSnapshot {
  readonly wallet: string;
  readonly holdAmount: number | null;
  readonly percentOfSupply: number | null;
  readonly pnlUsd: number | null;
  readonly tag: string | null;
  readonly probable?: boolean;
}

export interface ResolvedTokenSnapshot {
  readonly address: string;
  readonly chain: string;
  readonly symbol: string;
  /**
   * Serve-stale marker (dexter plan todo 19b1): `true` ONLY when the
   * backend replayed history (market-data fan-out failed) — dead
   * prices must never render as live, so the UI badges them.
   */
  readonly stale?: boolean | null;
  /** History-row ISO the stale replay was served from (`null` fresh). */
  readonly staleAsOf?: string | null;
  /** Serve-time age of the replay in ms (`null` fresh). */
  readonly staleAgeMs?: number | null;
  readonly name?: string | null;
  readonly marketCapUsd?: number | null;
  readonly fdvUsd?: number | null;
  readonly priceUsd?: number | null;
  readonly priceChange24h?: number | null;
  readonly liquidityUsd?: number | null;
  readonly lockedLiquidityPercent?: number | null;
  readonly burnedPercent?: number | null;
  readonly volume24hUsd?: number | null;
  readonly holders?: number | null;
  readonly top10HolderPercent?: number | null;
  readonly top20HolderPercent?: number | null;
  readonly totalSupply?: number | null;
  readonly circulatingSupply?: number | null;
  readonly maxSupply?: number | null;
  readonly devWallets?: ReadonlyArray<DevWalletSnapshot> | null;
  readonly devPctSupply?: number | null;
  readonly poolAddress?: string | null;
  readonly source?: string;
}

export interface PreviewResult {
  readonly text: string;
  readonly truncated: boolean;
  readonly parseMode: 'MarkdownV2';
  readonly placeholdersUsed: ReadonlyArray<string>;
  readonly unknown: ReadonlyArray<string>;
  /**
   * Frozen token snapshot (live-editor contract, additive): present on
   * success responses that resolved via `address`, absent on unresolved
   * shapes. Echo it back verbatim as `token` (WITHOUT `address`) to
   * re-render without re-resolving.
   */
  readonly token?: ResolvedTokenSnapshot;
}

/** Pipeline error shapes, propagated verbatim (same bodies as `GET /dexter/token`). */
export interface PreviewUnresolved {
  readonly error: string;
  readonly address: string;
  readonly candidates?: ReadonlyArray<string>;
  /**
   * Pending marker (robust-nulls, plan todo 19a): `true` ONLY on the
   * pending shape (`Token pending — retry shortly`, HTTP 200); absent
   * on every other unresolved shape. `isPreviewUnresolved` needs no
   * change (pending still carries `error`); surfaces render a pending
   * copy that differs from `Token not found`.
   */
  readonly pending?: boolean;
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
 * Preview request: `templateId` XOR `draft` AND `address` XOR `token`.
 * Both/neither of either pair → 400. Unresolved shapes carry NO token.
 * Live-editor hot path: `{ draft, token }` WITHOUT `address`.
 */
export interface PreviewTemplateBody {
  readonly templateId?: string;
  readonly draft?: PreviewDraftBody;
  readonly address?: string;
  readonly token?: ResolvedTokenSnapshot;
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
