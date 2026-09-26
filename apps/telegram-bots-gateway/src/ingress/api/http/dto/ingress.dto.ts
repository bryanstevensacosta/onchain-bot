import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SubscriberDto {
  @IsString()
  @IsNotEmpty()
  public appId!: string;

  @IsString()
  @Matches(/^https?:\/\/.+/, { message: 'url must be http(s)' })
  public url!: string;

  @IsOptional()
  @IsString()
  public secret?: string;
}

export class UpsertRouteDto {
  @IsString()
  @MinLength(8)
  public webhookSecret!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubscriberDto)
  public subscribers?: SubscriberDto[];
}

export class SetModeDto {
  @IsIn(['webhook', 'polling'])
  public mode!: 'webhook' | 'polling';
}
