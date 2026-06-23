import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { TokenCallRepository } from 'token/intake/parsing/application/ports/token-call.repository';
import {
  TokenCallMapper,
  TokenCallView,
} from 'token/intake/parsing/application/mappers/token-call.mapper';

@Injectable()
export class GetTokenCallUseCase {
  public constructor(private readonly callRepo: TokenCallRepository) {}

  public async execute(
    kolId: string,
    messageId: number,
  ): Promise<TokenCallView> {
    const call = await this.callRepo.findByChannelAndMessage(kolId, messageId);
    if (!call) {
      throw new DomainError(
        ErrorCode.NO_PARSED_CALL,
        `TokenCall not found: ${kolId}:${messageId}`,
        { kolId, messageId },
      );
    }
    return TokenCallMapper.toView(call);
  }
}
