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
