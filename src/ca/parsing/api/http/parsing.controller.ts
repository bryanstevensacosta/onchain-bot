import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ParseFromCandidatesUseCase } from 'ca/parsing/application/handlers/parse-from-candidates.use-case';
import { GetTokenCallUseCase } from 'ca/parsing/application/handlers/get-token-call.use-case';
import { GetRecentCallsUseCase } from 'ca/parsing/application/handlers/get-recent-calls.use-case';
import { ParseInput } from 'ca/parsing/api/input/parse.input';
import { ContractAddress } from 'ca/extraction/domain/value-objects/contract-address.vo';
import type { TokenCallView } from 'ca/parsing/application/mappers/token-call.mapper';

/**
 * HTTP adapter for the parsing BC.
 *
 * Routes are admin-only (manual parsing, backfill, debugging).
 */
@Controller('ca/parsing')
export class ParsingController {
  public constructor(
    private readonly parse: ParseFromCandidatesUseCase,
    private readonly getCall: GetTokenCallUseCase,
    private readonly getRecent: GetRecentCallsUseCase,
  ) {}

  @Post('parse')
  public run(@Body() input: ParseInput): Promise<TokenCallView> {
    const addresses = input.contractAddresses.map((c) => {
      if (c.chainHint === 'evm') return ContractAddress.fromEvm(c.value);
      if (c.chainHint === 'solana') return ContractAddress.fromSolana(c.value);
      return ContractAddress.fromUnknown(c.value);
    });
    return this.parse.execute({
      channelId: input.channelId,
      messageId: input.messageId,
      occurredAt: input.occurredAt,
      rawText: input.text,
      contractAddresses: addresses,
    });
  }

  @Get('calls/recent')
  public recent(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<TokenCallView>> {
    const parsed = limit ? Number(limit) : 10;
    return this.getRecent.execute(parsed);
  }

  @Get('calls/:channelId/:messageId')
  public get(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
  ): Promise<TokenCallView> {
    return this.getCall.execute(channelId, Number(messageId));
  }
}
