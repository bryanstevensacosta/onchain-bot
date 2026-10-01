import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Dry-run body: a real message evaluated against live rules (no feed I/O,
 * nothing persisted, nothing enqueued).
 */
export class EvaluateMessageDto {
  @ApiProperty({ description: 'Channel id (opaque, FK-less)' })
  @IsString()
  public channelId!: string;

  @ApiProperty({ description: 'Telegram message id' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  public messageId!: number;

  @ApiPropertyOptional({ description: 'Raw title (nullable)' })
  @IsOptional()
  @IsString()
  public title?: string | null;

  @ApiProperty({ description: 'Raw content (unfiltered)' })
  @IsString()
  public content!: string;

  @ApiPropertyOptional({
    description: 'True when the message carries photo/video',
  })
  @IsOptional()
  @IsBoolean()
  public hasMedia?: boolean;
}

/**
 * Filters-preview body: raw text evaluated against the channel chain.
 */
export class PreviewFiltersDto {
  @ApiPropertyOptional({ description: 'Raw title (nullable)' })
  @IsOptional()
  @IsString()
  public title?: string | null;

  @ApiProperty({ description: 'Raw content (unfiltered)' })
  @IsString()
  public content!: string;
}
