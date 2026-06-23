import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { ChainFamily } from 'chain/identity/chain-family.vo';
import { NormalizedAddress } from 'token/normalization/domain/value-objects/normalized-address.vo';
import { TokenLocator } from 'token/identity/token-locator.vo';
import { Source } from 'telegram-kol/source/domain/value-objects/source.vo';
import { TokenMetrics } from 'shared/common/value-objects/token-metrics.vo';
import { CallNormalizedEvent } from 'token/normalization/domain/events/call-normalized.event';

export interface MentionInput {
  readonly chain: ChainFamily;
  readonly address: NormalizedAddress;
  readonly ticker: string | null;
  readonly name: string | null;
  readonly chart: string | null;
  readonly metrics: TokenMetrics;
  readonly confidence: number;
  readonly kolId: string;
  readonly username: string | null;
  readonly messageId: number;
  readonly occurredAt: Date;
}

interface CanonicalTokenCallProps {
  readonly identity: TokenLocator;
  readonly ticker: string | null;
  readonly name: string | null;
  readonly chart: string | null;
  readonly bestMetrics: TokenMetrics;
  readonly sources: ReadonlyArray<Source>;
  readonly mentionCount: number;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
  readonly lastConfidence: number;
}

/**
 * Canonical token call: one entry per `(chain, address)` aggregating all
 * mentions across channels and messages.
 *
 * This is the "merged" view: when the same token is mentioned in 3
 * different Telegram channels, this entity has 1 row with 3 sources.
 *
 * Merge rules:
 * - Ticker: keep the higher-confidence one; on tie, the most recent.
 * - Name: keep the most recent non-null.
 * - Chart: keep the most recent non-null.
 * - Metrics: prefer the most recent non-null for each field independently.
 * - Sources: deduplicate by kolId, accumulating messageIds.
 * - firstSeenAt: min of all mention timestamps.
 * - lastSeenAt: max of all mention timestamps.
 * - mentionCount: sum across all sources.
 */
export class CanonicalTokenCall extends AggregateRoot<string> {
  private readonly state: CanonicalTokenCallProps;

  protected constructor(id: string, props: CanonicalTokenCallProps) {
    super(id);
    this.state = props;
  }

  public static create(input: MentionInput): CanonicalTokenCall {
    const identity = TokenLocator.create(input.chain, input.address);
    const source = Source.firstMention(
      input.kolId,
      input.messageId,
      input.username,
    );
    return new CanonicalTokenCall(identity.key, {
      identity,
      ticker: input.ticker,
      name: input.name,
      chart: input.chart,
      bestMetrics: input.metrics,
      sources: Object.freeze([source]),
      mentionCount: 1,
      firstSeenAt: input.occurredAt,
      lastSeenAt: input.occurredAt,
      lastConfidence: input.confidence,
    });
  }

  /**
   * Rehydrate an existing canonical call from persistence without
   * re-running invariant checks (chain identity, source list shape, etc.).
   * For hydration use ONLY — prefer `create()` for new aggregates and
   * `mergeWith()` to update existing ones.
   */
  public static reconstitute(props: {
    identity: TokenLocator;
    ticker: string | null;
    name: string | null;
    chart: string | null;
    bestMetrics: TokenMetrics;
    sources: ReadonlyArray<Source>;
    mentionCount: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    lastConfidence: number;
  }): CanonicalTokenCall {
    return new CanonicalTokenCall(props.identity.key, props);
  }

  /**
   * Merge a new mention into this canonical call.
   * Returns a NEW CanonicalTokenCall (entities are immutable from the outside).
   */
  public mergeWith(mention: MentionInput): CanonicalTokenCall {
    if (
      this.state.identity.chain.value !== mention.chain.value ||
      this.state.identity.address.value !== mention.address.value
    ) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Cannot merge mention with different identity`,
        {
          existing: this.state.identity.key,
          incoming: `${mention.chain.value}:${mention.address.value}`,
        },
      );
    }

    const updatedSources = mergeSources(this.state.sources, mention);
    const updatedMetrics = mergeMetrics(
      this.state.bestMetrics,
      mention.metrics,
    );
    const ticker = pickBetter(
      this.state.ticker,
      this.state.lastConfidence,
      mention.ticker,
      mention.confidence,
      this.state.lastSeenAt,
      mention.occurredAt,
    );
    const name = pickLatestNonNull(
      this.state.name,
      this.state.lastSeenAt,
      mention.name,
      mention.occurredAt,
    );
    const chart = pickLatestNonNull(
      this.state.chart,
      this.state.lastSeenAt,
      mention.chart,
      mention.occurredAt,
    );

    const newMentionCount = this.state.mentionCount + 1;
    const firstSeenAt =
      mention.occurredAt < this.state.firstSeenAt
        ? mention.occurredAt
        : this.state.firstSeenAt;
    const lastSeenAt =
      mention.occurredAt > this.state.lastSeenAt
        ? mention.occurredAt
        : this.state.lastSeenAt;

    return new CanonicalTokenCall(this.id, {
      identity: this.state.identity,
      ticker,
      name,
      chart,
      bestMetrics: updatedMetrics,
      sources: Object.freeze(updatedSources),
      mentionCount: newMentionCount,
      firstSeenAt,
      lastSeenAt,
      lastConfidence: mention.confidence,
    });
  }

  public get identity(): TokenLocator {
    return this.state.identity;
  }
  public get ticker(): string | null {
    return this.state.ticker;
  }
  public get name(): string | null {
    return this.state.name;
  }
  public get chart(): string | null {
    return this.state.chart;
  }
  public get bestMetrics(): TokenMetrics {
    return this.state.bestMetrics;
  }
  public get sources(): ReadonlyArray<Source> {
    return this.state.sources;
  }
  public get mentionCount(): number {
    return this.state.mentionCount;
  }
  public get firstSeenAt(): Date {
    return this.state.firstSeenAt;
  }
  public get lastSeenAt(): Date {
    return this.state.lastSeenAt;
  }
  public get lastConfidence(): number {
    return this.state.lastConfidence;
  }
  public get sourceCount(): number {
    return this.state.sources.length;
  }
  public get age(): number {
    return Date.now() - this.state.firstSeenAt.getTime();
  }
  public get timeSinceLastMention(): number {
    return Date.now() - this.state.lastSeenAt.getTime();
  }

  public emitNormalized(): void {
    this.apply(
      new CallNormalizedEvent({
        chain: this.state.identity.chain.value,
        address: this.state.identity.address.value,
        ticker: this.state.ticker,
        name: this.state.name,
        chart: this.state.chart,
        marketCapUsd: this.state.bestMetrics.marketCapUsd,
        liquidityUsd: this.state.bestMetrics.liquidityUsd,
        fdvUsd: this.state.bestMetrics.fdvUsd,
        holders: this.state.bestMetrics.holders,
        sourceCount: this.state.sources.length,
        mentionCount: this.state.mentionCount,
        firstSeenAt: this.state.firstSeenAt,
        lastSeenAt: this.state.lastSeenAt,
        confidence: this.state.lastConfidence,
      }),
    );
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}

function mergeSources(
  existing: ReadonlyArray<Source>,
  mention: MentionInput,
): Source[] {
  const idx = existing.findIndex((s) => s.kolId === mention.kolId);
  if (idx === -1) {
    return [
      ...existing,
      Source.firstMention(mention.kolId, mention.messageId, mention.username),
    ];
  }
  const updated = existing[idx].addMessage(mention.messageId);
  const next = [...existing];
  next[idx] = updated;
  return next;
}

function mergeMetrics(
  existing: TokenMetrics,
  incoming: TokenMetrics,
): TokenMetrics {
  return TokenMetrics.create({
    marketCapUsd: incoming.marketCapUsd ?? existing.marketCapUsd,
    liquidityUsd: incoming.liquidityUsd ?? existing.liquidityUsd,
    fdvUsd: incoming.fdvUsd ?? existing.fdvUsd,
    holders: incoming.holders ?? existing.holders,
  });
}

/**
 * Pick the value with higher confidence; on tie, the most recent.
 * Returns null only if BOTH are null.
 */
function pickBetter(
  existingValue: string | null,
  existingConfidence: number,
  incomingValue: string | null,
  incomingConfidence: number,
  existingTime: Date,
  incomingTime: Date,
): string | null {
  if (incomingValue === null) return existingValue;
  if (existingValue === null) return incomingValue;
  if (incomingConfidence > existingConfidence) return incomingValue;
  if (incomingConfidence < existingConfidence) return existingValue;
  return incomingTime >= existingTime ? incomingValue : existingValue;
}

function pickLatestNonNull(
  existing: string | null,
  existingTime: Date,
  incoming: string | null,
  incomingTime: Date,
): string | null {
  if (incoming === null) return existing;
  if (existing === null) return incoming;
  return incomingTime >= existingTime ? incoming : existing;
}
