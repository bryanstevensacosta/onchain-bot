/**
 * @deprecated Moved to apps/kol-calls/src/parsing/ (Tramo 1, todo 6 + P18 companion).
 * Parsing 1:1 now lives in kol-calls: ParseFromCandidatesUseCase → ParsedCall
 * (preserves mentions, NO collapse-to-one). This file stays wired for dual-run;
 * it will be removed in todo 16 (cutover + cleanup). Do not extend it — add parsing
 * logic in apps/kol-calls/src/parsing/ instead.
 *
 * New location: apps/kol-calls/src/parsing/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ContractAddressInput {
  @IsString()
  @IsNotEmpty()
  public value!: string;

  @IsString()
  public chainHint!: 'evm' | 'solana' | 'unknown';
}

export class ParseInput {
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractAddressInput)
  public contractAddresses!: ContractAddressInput[];

  @IsOptional()
  @IsString()
  public username?: string | null;
}
