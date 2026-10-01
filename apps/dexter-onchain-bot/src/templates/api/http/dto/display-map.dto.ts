import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import {
  MAX_MATCH_VALUE_LENGTH,
  MIN_MATCH_VALUE_LENGTH,
} from '@/templates/domain/display-map.validators';

/**
 * DTOs for the display-maps HTTP API (dexter-message-templates,
 * display-catalog rename).
 *
 * Limits mirror the domain validators 1:1 (same source constants for
 * `matchValue` 1-40; `display` non-empty here with the 1-40 char rule
 * enforced by `validateDisplay` in the controller path — class-validator
 * `Length` counts UTF-16 units, so the domain stays the source of truth
 * for display strings mixing text and emoji).
 * Unknown `placeholderKey` values pass the DTO and are rejected in the
 * controller with a 400 carrying the whitelist (`DISPLAY_PLACEHOLDER_KEYS`).
 */
export class CreateDisplayMapDto {
  @IsString()
  @IsNotEmpty()
  public placeholderKey!: string;

  @IsString()
  @Length(MIN_MATCH_VALUE_LENGTH, MAX_MATCH_VALUE_LENGTH)
  public matchValue!: string;

  @IsString()
  @IsNotEmpty()
  public display!: string;
}

export class UpdateDisplayMapDto {
  @IsOptional()
  @IsString()
  @Length(MIN_MATCH_VALUE_LENGTH, MAX_MATCH_VALUE_LENGTH)
  public matchValue?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public display?: string;
}
