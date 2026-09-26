/**
 * Outbound port for KOL ingestion reads.
 *
 * Implemented by the HTTP adapter over the ingestion-telegram feed API.
 * All reads are scoped to KOL sources server-side via `?type=kol`.
 */
export interface KolIngestedMessage {
  channelId: string;
  messageId: number;
  text: string;
  occurredAt: string;
  messageType: string;
}

export interface KolSource {
  channelId: string;
  title: string | null;
  handle: string | null;
  type: string;
  /**
   * P19: permanent avatar URL from the feed projection
   * (`GET /api/feed/sources?type=kol`). Null when the projection predates
   * avatars — consumers fall back to the servable placeholder.
   */
  avatarUrl: string | null;
}

export abstract class KolIngestionClientPort {
  abstract listKolSources(): Promise<KolSource[]>;
  abstract fetchRecentKolMessages(
    limit: number,
    channelId?: string,
  ): Promise<KolIngestedMessage[]>;
}
