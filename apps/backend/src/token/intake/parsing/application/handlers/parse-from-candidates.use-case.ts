/**
 * @deprecated Moved to apps/kol-calls/src/parsing/ (Tramo 1, todo 6 + P18 companion).
 * Parsing 1:1 now lives in kol-calls: ParseFromCandidatesUseCase → ParsedCall
 * (preserves mentions, NO collapse-to-one). This file stays wired for dual-run;
 * it will be removed in todo 16 (cutover + cleanup). Do not extend it — add parsing
 * logic in apps/kol-calls/src/parsing/ instead.
 *
 * New location: apps/kol-calls/src/parsing/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
import { Injectable } from '@nestjs/common';
import { ParserPort } from 'token/intake/parsing/domain/ports/parser.port';
import { TokenCall } from 'token/intake/parsing/domain/entities/token-call.entity';
import { TokenCallRepository } from 'token/intake/parsing/application/ports/token-call.repository';
import { ParsingEventPublisher } from 'token/intake/parsing/application/ports/parsing-event.publisher';
import {
  TokenCallMapper,
  TokenCallView,
} from 'token/intake/parsing/application/mappers/token-call.mapper';
import { ContractAddress } from 'token/identity/contract-address.vo';

export interface ParseFromCandidatesInput {
  readonly kolId: string;
  readonly messageId: number;
  readonly occurredAt: Date;
  readonly rawText: string;
  readonly contractAddresses: ReadonlyArray<ContractAddress>;
  readonly username?: string | null;
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
      kolId: input.kolId,
      messageId: input.messageId,
      occurredAt: input.occurredAt,
      contractAddresses: input.contractAddresses,
      ticker: parsed.ticker,
      name: parsed.name,
      metrics: parsed.metrics,
      chart: parsed.chart,
      username: input.username ?? null,
    });

    await this.callRepo.save(call);

    call.emitCallParsed();
    await this.eventPublisher.publishAll(call.commit());

    return TokenCallMapper.toView(call);
  }
}
