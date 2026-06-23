import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TokenScoredEvent } from 'token/scoring/domain/events/token-scored.event';
import { AnalyzeTokenHoneypotUseCase } from 'token/honeypot/application/handlers/analyze-token-honeypot.use-case';

@Injectable()
export class TokenScoredHandler {
  private readonly logger = new Logger(TokenScoredHandler.name);

  public constructor(private readonly analyze: AnalyzeTokenHoneypotUseCase) {}

  @OnEvent('scoring.token.scored', { async: true })
  public async handle(event: TokenScoredEvent): Promise<void> {
    if (
      event.payload.securityFlag === 'UNKNOWN' ||
      event.payload.securityFlag === 'SCAM'
    ) {
      return;
    }
    try {
      await this.analyze.execute({
        chain: event.payload.chain,
        address: event.payload.address,
      });
    } catch (err) {
      this.logger.error(
        `Honeypot analysis failed for ${event.payload.address}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
