import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * v2 contract input for `POST /api/threads` (frozen in v1 — the
 * controller answers 501 until the C1 un-stubbing contract activates
 * these routes; the shape is pinned now so both tramos build against
 * it). Mirrors the spec §9 `ThreadMessageInput`.
 */
export class ThreadMessageInputDto {
  @IsString()
  @Matches(/\S/, { message: 'content must contain a non-blank character' })
  public readonly content!: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  public readonly mediaUrls?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  public readonly delaySeconds?: number;
}

export class CreateThreadDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ThreadMessageInputDto)
  public readonly messages!: ThreadMessageInputDto[];
}
