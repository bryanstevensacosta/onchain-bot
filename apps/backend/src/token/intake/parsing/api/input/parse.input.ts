import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsInt,
  IsNotEmpty,
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
}
