import { ExtractionResult } from 'token/intake/extraction/domain/entities/extraction-result.entity';
import { ContractAddress } from 'token/identity/contract-address.vo';
import { Ticker } from 'token/intake/extraction/domain/value-objects/ticker.vo';
import { Url } from 'token/intake/extraction/domain/value-objects/url.vo';
import { ExtractionResultEntity } from 'token/intake/extraction/infrastructure/persistence/typeorm/entities/extraction-result.entity';

export class ExtractionResultMapper {
  public static toRow(r: ExtractionResult): ExtractionResultEntity {
    const row = new ExtractionResultEntity();
    row.id = r.id;
    row.kolId = r.kolId;
    row.messageId = String(r.messageId);
    row.occurredAt = r.occurredAt;
    row.contractAddresses = r.contractAddresses.map((c) => ({
      value: c.value,
      chainHint: c.chainHint as unknown as 'evm' | 'solana' | 'unknown',
    }));
    row.tickers = r.tickers.map((t) => t.value);
    row.urls = r.urls.map((u) => u.value);
    return row;
  }

  public static toDomain(row: ExtractionResultEntity): ExtractionResult {
    const contractAddresses = row.contractAddresses.map((c) =>
      c.chainHint === 'evm'
        ? ContractAddress.fromEvm(c.value)
        : c.chainHint === 'solana'
          ? ContractAddress.fromSolana(c.value)
          : ContractAddress.fromUnknown(c.value),
    );
    const tickers = row.tickers.map((t) => Ticker.fromString(t));
    const urls = row.urls.map((u) => Url.fromString(u));
    return ExtractionResult.rehydrate({
      id: row.id,
      kolId: row.kolId,
      messageId: Number(row.messageId),
      occurredAt: row.occurredAt,
      contractAddresses,
      tickers,
      urls,
    });
  }
}
