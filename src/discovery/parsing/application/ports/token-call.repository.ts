import { TokenCall } from 'discovery/parsing/domain/entities/token-call.entity';

/**
 * Outbound port: persistence for parsed TokenCalls.
 */
export abstract class TokenCallRepository {
  public abstract save(call: TokenCall): Promise<void>;
  public abstract findByChannelAndMessage(
    channelId: string,
    messageId: number,
  ): Promise<TokenCall | null>;
  public abstract findRecent(limit: number): Promise<ReadonlyArray<TokenCall>>;
}
