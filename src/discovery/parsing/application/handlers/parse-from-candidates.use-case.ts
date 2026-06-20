import { Injectable } from '@nestjs/common';
import { ParserPort } from 'discovery/parsing/domain/ports/parser.port';
import { TokenCall } from 'discovery/parsing/domain/entities/token-call.entity';
import { TokenCallRepository } from 'discovery/parsing/application/ports/token-call.repository';
import { ParsingEventPublisher } from 'discovery/parsing/application/ports/parsing-event.publisher';
import {
  TokenCallMapper,
  TokenCallView,
} from 'discovery/parsing/application/mappers/token-call.mapper';
import { ContractAddress } from 'discovery/extraction/domain/value-objects/contract-address.vo';

export interface ParseFromCandidatesInput {
  readonly channelId: string;
  readonly messageId: number;
  readonly occurredAt: Date;
  readonly rawText: string;
  readonly contractAddresses: ReadonlyArray<ContractAddress>;
}

/**
 * Use case: build a TokenCall from extracted candidates + parsed fields.
 *
 * If `contractAddresses` is empty the use case throws NO_CONTRACT_ADDRESS
 * (callers should skip non-call messages).
 */
@Injectable()
export class ParseFromCandidatesUseCase {
  public constructor(
    private readonly parser: ParserPort,
    private readonly callRepo: TokenCallRepository,
    private readonly eventPublisher: ParsingEventPublisher,
  ) {}

  public async execute(
    input: ParseFromCandidatesInput,
  ): Promise<TokenCallView> {
    const parsed = await this.parser.parse({ rawText: input.rawText });

    const call = TokenCall.create({
      channelId: input.channelId,
      messageId: input.messageId,
      occurredAt: input.occurredAt,
      rawText: input.rawText,
      contractAddresses: input.contractAddresses,
      ticker: parsed.ticker,
      name: parsed.name,
      metrics: parsed.metrics,
      chart: parsed.chart,
    });

    await this.callRepo.save(call);

    call.emitCallParsed();
    await this.eventPublisher.publishAll(call.commit());

    return TokenCallMapper.toView(call);
  }
}
