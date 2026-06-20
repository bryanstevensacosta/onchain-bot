import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { TokenCallRepository } from 'discovery/parsing/application/ports/token-call.repository';
import {
  TokenCallMapper,
  TokenCallView,
} from 'discovery/parsing/application/mappers/token-call.mapper';

@Injectable()
export class GetTokenCallUseCase {
  public constructor(private readonly callRepo: TokenCallRepository) {}

  public async execute(
    channelId: string,
    messageId: number,
  ): Promise<TokenCallView> {
    const call = await this.callRepo.findByChannelAndMessage(
      channelId,
      messageId,
    );
    if (!call) {
      throw new DomainError(
        ErrorCode.NO_PARSED_CALL,
        `TokenCall not found: ${channelId}:${messageId}`,
        { channelId, messageId },
      );
    }
    return TokenCallMapper.toView(call);
  }
}
