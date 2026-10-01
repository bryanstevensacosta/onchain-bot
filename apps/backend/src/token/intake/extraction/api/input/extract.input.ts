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
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
} from 'class-validator';

/**
 * Inbound payload for POST /ca/extraction/extract.
 *
 * Allows arbitrary text to be extracted on demand — useful for manual
 * testing, replays, and backfill scenarios.
 */
export class ExtractInput {
  @IsString()
  @IsNotEmpty()
  public kolId!: string;

  @IsInt()
  @IsPositive()
  public messageId!: number;

  @Type(() => Date)
  @IsDate()
  public occurredAt!: Date;

  @IsString()
  @IsNotEmpty()
  public text!: string;
}
