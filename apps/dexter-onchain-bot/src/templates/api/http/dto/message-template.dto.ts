import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import {
  MAX_BODY_LENGTH,
  MAX_NAME_LENGTH,
  MIN_BODY_LENGTH,
  MIN_NAME_LENGTH,
} from '@/templates/domain/message-template.validators';
import { TEMPLATE_COMMANDS } from '@/placeholders/domain/placeholder-registry';

/**
 * DTOs for the message-templates HTTP API (dexter-message-templates
 * todo 6).
 *
 * Limits mirror the domain validators 1:1 (same source constants:
 * name 1-100, body 1-4000, closed command enum). Placeholder whitelist
 * + duplicate-pair rules are enforced via the DOMAIN validators and
 * the registry inside the controller (DTOs carry type/shape only, so
 * direct calls get the same 400s as HTTP pipe calls — one source of
 * truth, no drift between layers; same pattern as todo 8
 * display-map DTOs).
 */
export class CreateMessageTemplateDto {
  @IsString()
  @IsIn([...TEMPLATE_COMMANDS] as string[])
  public command!: string;

  @IsString()
  @IsNotEmpty()
  @Length(MIN_NAME_LENGTH, MAX_NAME_LENGTH)
  public name!: string;

  @IsString()
  @IsNotEmpty()
  @Length(MIN_BODY_LENGTH, MAX_BODY_LENGTH)
  public bodyMarkdown!: string;
}

export class UpdateMessageTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(MIN_NAME_LENGTH, MAX_NAME_LENGTH)
  public name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(MIN_BODY_LENGTH, MAX_BODY_LENGTH)
  public bodyMarkdown?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public command?: string;
}
