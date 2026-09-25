/**
 * Outbound port for crypto-news ingestion reads.
 *
 * Implemented by the HTTP adapter over the ingestion-telegram feed API.
 * All reads are scoped to crypto-news sources server-side via
 * `?type=crypto-news` (P10: this app never requests the foreign type).
 */
export interface CryptoNewsIngestedMessage {
  channelId: string;
  messageId: number;
  text: string;
  occurredAt: string;
  messageType: string;
}

export interface CryptoNewsSource {
  channelId: string;
  title: string | null;
  handle: string | null;
  type: string;
}

export abstract class CryptoNewsIngestionClientPort {
  abstract listCryptoNewsSources(): Promise<CryptoNewsSource[]>;
  abstract fetchRecentCryptoNewsMessages(
    limit: number,
    channelId?: string,
  ): Promise<CryptoNewsIngestedMessage[]>;
}
