import { IsIn, IsString } from 'class-validator';

/**
 * Explicit publish DTO (todo 14, P50): one message through one
 * session-owned binding. Ownership is enforced server-side (verified
 * bot + verified channel); the client only names the binding.
 */
export class PublishSessionMessageDto {
  @IsIn(['telegram', 'threads'])
  public target!: 'telegram' | 'threads';

  @IsString()
  public botId!: string;

  @IsString()
  public chatId!: string;

  @IsString()
  public content!: string;
}
