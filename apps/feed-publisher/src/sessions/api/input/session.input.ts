import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { SESSION_NAME_MAX_LENGTH } from '@/sessions/domain/entities/publishing-session.entity';

/**
 * Frontend DTOs for session CRUD (todo 12, P34).
 */
export class CreateSessionDto {
  @IsOptional()
  @IsString()
  public id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SESSION_NAME_MAX_LENGTH)
  public name?: string;

  @IsOptional()
  @IsString()
  public templateId?: string | null;

  @IsOptional()
  public sourceToggles?: Record<string, boolean>;

  @IsOptional()
  @IsArray()
  public keywordIds?: string[];

  @IsOptional()
  public matchingEnabled?: boolean;

  @IsOptional()
  public publishingEnabled?: boolean;

  @IsOptional()
  public llmEnabled?: boolean;

  @IsOptional()
  @IsArray()
  public telegramTargets?: Array<{ botId: string; chatId: string }>;

  @IsOptional()
  @IsArray()
  public threadsTargets?: Array<{ botId: string; chatId: string }>;

  @IsOptional()
  public active?: boolean;
}

export class UpdateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(SESSION_NAME_MAX_LENGTH)
  public name?: string;

  @IsOptional()
  @IsString()
  public templateId?: string | null;

  @IsOptional()
  public sourceToggles?: Record<string, boolean>;

  @IsOptional()
  @IsArray()
  public keywordIds?: string[];

  @IsOptional()
  public matchingEnabled?: boolean;

  @IsOptional()
  public publishingEnabled?: boolean;

  @IsOptional()
  public llmEnabled?: boolean;

  @IsOptional()
  @IsArray()
  public telegramTargets?: Array<{ botId: string; chatId: string }>;

  @IsOptional()
  @IsArray()
  public threadsTargets?: Array<{ botId: string; chatId: string }>;

  @IsOptional()
  public active?: boolean;
}

export class SetSourceToggleDto {
  @IsString()
  public sourceId!: string;

  public enabled!: boolean;
}
