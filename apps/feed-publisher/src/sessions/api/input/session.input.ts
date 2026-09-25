import { IsArray, IsOptional, IsString } from 'class-validator';

/**
 * Frontend DTOs for session CRUD (todo 12, P34).
 */
export class CreateSessionDto {
  @IsOptional()
  @IsString()
  public id?: string;

  @IsString()
  public name!: string;

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
