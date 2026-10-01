/**
 * @deprecated Moved to apps/kol-calls/src/extraction/ (Tramo 1, todo 5 + P18 companion).
 * Extraction per-mention now lives in kol-calls: ExtractFromMessageUseCase (direct call,
 * fix-1, no event bus; multi-tip NO collapse, one row per mention) + snapshot base emit.
 * This file stays wired for dual-run; it will be removed in todo 16 (cutover + cleanup).
 * Do not extend it — add extraction logic in apps/kol-calls/src/extraction/ instead.
 *
 * New location: apps/kol-calls/src/extraction/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
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
