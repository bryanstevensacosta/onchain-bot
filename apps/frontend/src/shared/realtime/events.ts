/**
 * WebSocket event payload types — 1:1 mirror of the backend DomainEvents
 * (see `kol-refactor.md`).
 *
 * `kolId` here is the field name in the wire payload; it represents the
 * KOL that emitted the event. Previously named `channelId` before the
 * kol-refactor consolidated naming across the pipeline.
 */

export type Chain = 'solana' | 'evm';

export interface TelegramMessageIngestedEvent {
  kolId: string;
  messageId: number;
  text: string;
  occurredAt: string;
}

export interface ExtractionCandidatesExtractedEvent {
  kolId: string;
  messageId: number;
  contractAddresses: ReadonlyArray<{
    value: string;
    chainHint: Chain | 'unknown';
  }>;
  tickers: ReadonlyArray<string>;
  urls: ReadonlyArray<{ value: string; scheme: string }>;
}

export interface ParsingCallParsedEvent {
  kolId: string;
  messageId: number;
  chain: Chain;
  address: string;
  ticker: string | null;
  confidence: number;
}

export interface NormalizationCallNormalizedEvent {
  chain: Chain;
  address: string;
  mentionCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface EnrichmentTokenEnrichedEvent {
  chain: Chain;
  address: string;
  priceUsd: number | null;
  liquidityUsd: number | null;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  holders: number | null;
}

export interface ClassificationTokenClassifiedEvent {
  chain: Chain;
  address: string;
  classification: 'TOKEN' | 'POOL' | 'ROUTER' | 'NFT' | 'SCAM' | 'UNKNOWN';
  securityFlag: string;
  confidence: number;
  signals: ReadonlyArray<string>;
}

export type ScoreTier = 'STRONG' | 'GOOD' | 'NEUTRAL' | 'POOR' | 'FAILED';

export interface ScoringTokenScoredEvent {
  chain: Chain;
  address: string;
  ticker: string | null;
  score: number;
  tier: ScoreTier;
  breakdown: ReadonlyArray<{ factor: string; weight: number }>;
  scoredAt: string;
}

export interface TokenGatingDecisionAppliedEvent {
  chain: Chain;
  address: string;
  verdict: 'APPROVED' | 'REJECTED';
  reasons: ReadonlyArray<{ code: string; message: string }>;
  decidedAt: string;
}

/**
 * `publishedBotChannelIds` / `failedBotChannelIds` are the IDs of the
 * bot's OUTPUT channels (where the SpyDefi bot published to), not KOLs.
 * The "channel" terminology is intentionally retained here because it
 * refers to a different domain concept than a KOL channel.
 */
export interface PublishingTelegramPublishedEvent {
  chain: Chain;
  address: string;
  tier: ScoreTier;
  message: string;
  publishedBotChannelIds: ReadonlyArray<string>;
  failedBotChannelIds: ReadonlyArray<string>;
}

export interface PublishingTelegramFailedEvent {
  chain: Chain;
  address: string;
  error: string;
  failedBotChannelIds: ReadonlyArray<string>;
}

export interface AnalyticsEvaluationCompletedEvent {
  callId: string;
  chain: Chain;
  address: string;
  horizons: ReadonlyArray<number>;
  tier: ScoreTier;
  athMultiple: number | null;
}

export interface ServerHello {
  serverTime: string;
  missedSince: string | null;
  bufferedCount: number;
}

export interface KpisUpdatedPayload {
  updatedAt: string;
}

export const WS_EVENTS = {
  Hello: 'hello',
  MessageIngested: 'telegram.message.ingested',
  ExtractionExtracted: 'extraction.candidates.extracted',
  ParsingParsed: 'parsing.call.parsed',
  NormalizationNormalized: 'normalization.call.normalized',
  EnrichmentEnriched: 'enrichment.token.enriched',
  ClassificationClassified: 'classification.token.classified',
  ScoringScored: 'scoring.token.scored',
  FiltersDecision: 'token-gating.decision.applied',
  PublishingPublished: 'publishing.telegram.published',
  PublishingFailed: 'publishing.telegram.failed',
  AnalyticsCompleted: 'analytics.evaluation.completed',
  DashboardKpisUpdated: 'dashboard.kpis.updated',
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
