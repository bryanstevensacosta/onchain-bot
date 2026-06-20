import { Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class EnqueueJobsInputDto {
  @IsString()
  @IsNotEmpty()
  public channelId!: string;

  @IsString()
  @IsNotEmpty()
  public chain!: string;

  @IsString()
  @IsNotEmpty()
  public address!: string;

  @Type(() => Date)
  @IsDate()
  public callTimestamp!: Date;

  @IsOptional()
  @IsNumber()
  public mcAtCall?: number | null;
}
