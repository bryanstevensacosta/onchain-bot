import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TargetBindingDto {
  @IsIn(['telegram', 'threads'])
  public target!: 'telegram' | 'threads';

  @IsString()
  @IsNotEmpty()
  public bindingId!: string;

  @IsString()
  @IsNotEmpty()
  public botId!: string;

  @IsString()
  @IsNotEmpty()
  public chatId!: string;
}

export class ContentButtonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  public text!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  public url!: string;
}

/**
 * Contract §2 request DTO. `content` / `scheduleKind` discriminate on
 * `contentKind` / `scheduleKind` via ValidateIf (class-validator has
 * no untagged unions): exactly one scheduleKind per request (oneShot
 * XOR recurring). Shape violations are 400 (global ValidationPipe);
 * semantic violations are 422/403/404/409 via DomainError (never
 * silently fixed).
 */
export class SchedulePostDto {
  @IsString()
  @IsNotEmpty()
  public sessionId!: string;

  @ValidateNested()
  @Type(() => TargetBindingDto)
  public binding!: TargetBindingDto;

  @IsIn(['pre-written', 'content-ref'])
  public contentKind!: 'pre-written' | 'content-ref';

  @ValidateIf((o: SchedulePostDto) => o.contentKind === 'pre-written')
  @IsString()
  public text?: string;

  @ValidateIf((o: SchedulePostDto) => o.contentKind === 'pre-written')
  @IsArray()
  @IsString({ each: true })
  public mediaIds?: string[];

  @ValidateIf((o: SchedulePostDto) => o.contentKind === 'pre-written')
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ContentButtonDto)
  public buttons?: ContentButtonDto[] | null;

  @ValidateIf((o: SchedulePostDto) => o.contentKind === 'content-ref')
  @IsString()
  @IsNotEmpty()
  public queueEntryId?: string;

  @IsIn(['once', 'cron'])
  public scheduleKind!: 'once' | 'cron';

  @ValidateIf((o: SchedulePostDto) => o.scheduleKind === 'once')
  @IsString()
  @IsNotEmpty()
  public fireAt?: string;

  @ValidateIf((o: SchedulePostDto) => o.scheduleKind === 'cron')
  @IsString()
  @IsNotEmpty()
  public cronExpr?: string;

  @ValidateIf((o: SchedulePostDto) => o.scheduleKind === 'cron')
  @IsIn(['UTC'])
  public timezone?: 'UTC';

  @IsUUID('4')
  public idempotencyKey!: string;
}
