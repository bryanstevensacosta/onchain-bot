import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export type SendKind = 'message' | 'photo' | 'media_group';

/**
 * `POST /api/bots/:id/send` body (todo 2). One DTO for the three Bot API
 * shapes the gateway coordinates — message / photo / media-group.
 * `client_msg_id` is the idempotency key (with bot + chat); when absent
 * the send is NOT deduplicated.
 */
export class SendDto {
  @IsIn(['message', 'photo', 'media_group'])
  public kind!: SendKind;

  @IsString()
  @IsNotEmpty()
  public chat_id!: string;

  @ValidateIf((o: SendDto) => o.kind === 'message')
  @IsString()
  @IsNotEmpty()
  public text?: string;

  @ValidateIf((o: SendDto) => o.kind === 'photo')
  @IsString()
  @IsNotEmpty()
  public photo?: string;

  @ValidateIf((o: SendDto) => o.kind === 'media_group')
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsObject({ each: true })
  public media?: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  public caption?: string;

  @IsOptional()
  @IsString()
  public parse_mode?: string;

  @IsOptional()
  @IsBoolean()
  public disable_notification?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  public client_msg_id?: string;
}
