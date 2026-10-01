import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import {
  MAX_MATCH_VALUE_LENGTH,
  MIN_MATCH_VALUE_LENGTH,
} from '@/templates/domain/emoji-map.validators';

/**
 * DTOs for the emoji-maps HTTP API (todo 8, dexter-message-templates).
 *
 * Limits mirror the domain validators 1:1 (same source constants for
 * `matchValue` 1-40; `emoji` non-empty here with the 1-8 grapheme rule
 * enforced by `validateEmoji` in the controller path — class-validator
 * `Length` counts UTF-16 units, not graphemes, so it cannot express it).
 * Unknown `placeholderKey` values pass the DTO and are rejected in the
 * controller with a 400 carrying the whitelist (`EMOJI_PLACEHOLDER_KEYS`).
 */
export class CreateEmojiMapDto {
  @IsString()
  @IsNotEmpty()
  public placeholderKey!: string;

  @IsString()
  @Length(MIN_MATCH_VALUE_LENGTH, MAX_MATCH_VALUE_LENGTH)
  public matchValue!: string;

  @IsString()
  @IsNotEmpty()
  public emoji!: string;
}

export class UpdateEmojiMapDto {
  @IsOptional()
  @IsString()
  @Length(MIN_MATCH_VALUE_LENGTH, MAX_MATCH_VALUE_LENGTH)
  public matchValue?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public emoji?: string;
}
