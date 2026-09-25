import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Frontend DTOs for content-template CRUD (todo 12).
 */
export class CreateContentTemplateDto {
  @IsOptional()
  @IsString()
  public id?: string;

  @IsString()
  public name!: string;

  @IsOptional()
  @IsArray()
  public sourceIds?: string[];

  @IsOptional()
  @IsArray()
  public keywordIds?: string[];

  @IsOptional()
  @IsString()
  public promptTemplateId?: string | null;

  @IsArray()
  @IsIn(['telegram', 'threads'], { each: true })
  public targets!: Array<'telegram' | 'threads'>;

  @IsOptional()
  @IsArray()
  public botBindings?: Array<{
    botId: string;
    target: 'telegram' | 'threads';
    chatId: string;
  }>;

  @IsOptional()
  public matchingEnabled?: boolean;

  @IsOptional()
  public llmEnabled?: boolean;

  @IsOptional()
  public publishingEnabled?: boolean;
}

export class UpdateContentTemplateDto {
  @IsOptional()
  @IsArray()
  public sourceIds?: string[];

  @IsOptional()
  @IsArray()
  public keywordIds?: string[];

  @IsOptional()
  @IsString()
  public promptTemplateId?: string | null;

  @IsOptional()
  @IsArray()
  @IsIn(['telegram', 'threads'], { each: true })
  public targets?: Array<'telegram' | 'threads'>;

  @IsOptional()
  @IsArray()
  public botBindings?: Array<{
    botId: string;
    target: 'telegram' | 'threads';
    chatId: string;
  }>;

  @IsOptional()
  public matchingEnabled?: boolean;

  @IsOptional()
  public llmEnabled?: boolean;

  @IsOptional()
  public publishingEnabled?: boolean;

  @IsOptional()
  public active?: boolean;
}

export class CreateTemplateBotDto {
  @IsOptional()
  @IsString()
  public id?: string;

  @IsString()
  public label!: string;

  @IsIn(['telegram', 'threads'])
  public target!: 'telegram' | 'threads';

  @IsString()
  public token!: string;

  @IsOptional()
  @IsString()
  public defaultChatId?: string | null;
}
