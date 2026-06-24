/**
 * Outbound port: ingests raw messages from a Telegram KOL channel.
 *
 * Implemented by infrastructure adapters (MTProto client, REST webhooks, etc.)
 *
 * Defined as an abstract class (not interface) so it can be used as a NestJS DI token.
 *
 * Fase 4 of the kol-refactor plan: renamed from `TelegramListenerPort`.
 * Method param names kept as `kolId` (semantically identical to the old
 * `channelId` — Telegram peer ids of KOL channels).
 */
export abstract class KolListenerPort {
  public abstract subscribe(kolIds: string[]): AsyncIterable<RawKolMessage>;
  public abstract backfill(
    kolId: string,
    limit: number,
  ): Promise<RawKolMessage[]>;
  public abstract disconnect(): Promise<void>;
  public abstract resolveKolMetadata(
    kolId: string,
  ): Promise<ResolvedKolMetadata>;
}

/**
 * Metadata resolved from Telegram for a given peer id.
 * Used by seeders/importers that don't carry a title up front.
 *
 * `kind` discriminates between real broadcast channels (the only kind we
 * want to subscribe to for ingestion), small group chats, and user
 * accounts. User IDs are commonly mis-seeded as KOL IDs; they
 * resolve to entities without a `title` and must not be registered.
 */
export interface ResolvedKolMetadata {
  readonly kolId: string;
  readonly title: string;
  readonly handle: string | null;
  readonly kind: 'channel' | 'user' | 'unknown';
}

/**
 * Raw Telegram message as received from MTProto.
 * Infrastructure-only type; not part of the domain.
 */
export interface RawKolMessage {
  readonly kolId: string;
  readonly messageId: number;
  readonly text: string;
  readonly occurredAt: Date;
  readonly entities?: ReadonlyArray<{
    readonly type: string;
    readonly offset: number;
    readonly length: number;
    readonly url?: string;
  }>;
  readonly hasMedia?: boolean;
}
