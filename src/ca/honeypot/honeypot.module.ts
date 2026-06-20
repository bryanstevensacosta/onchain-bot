import { Module } from '@nestjs/common';
import { HoneypotAnalyzerPort } from 'ca/honeypot/domain/ports/honeypot-analyzer.port';
import { HoneypotAnalysisRepository } from 'ca/honeypot/application/ports/honeypot-analysis.repository';
import { AnalyzeTokenHoneypotUseCase } from 'ca/honeypot/application/handlers/analyze-token-honeypot.use-case';
import { GetHoneypotAnalysisUseCase } from 'ca/honeypot/application/handlers/get-honeypot-analysis.use-case';
import { ListHoneypotAnalysesUseCase } from 'ca/honeypot/application/handlers/list-honeypot-analyses.use-case';
import { HeuristicHoneypotAnalyzerAdapter } from 'ca/honeypot/infrastructure/adapters/heuristic-honeypot-analyzer.adapter';
import { InMemoryHoneypotAnalysisRepository } from 'ca/honeypot/infrastructure/repositories/in-memory-honeypot-analysis.repository';
import { TokenScoredHandler } from 'ca/honeypot/infrastructure/event-bus/token-scored.handler';
import { HoneypotController } from 'ca/honeypot/api/http/honeypot.controller';

/**
 * Honeypot Detection BC module.
 *
 * v1: heuristic-only (no on-chain simulation). Uses DexScreener market
 * data + heuristics to flag likely honeypots.
 *
 * v2 will add:
 * - GoPlus Security API integration
 * - Bytecode pattern matching via Alchemy
 * - Fork-based sell simulation via Tenderly
 *
 * Consumes: `scoring.token.scored` events (only TOKEN classification)
 * Emits:    `honeypot.analysis.completed` events
 */
@Module({
  controllers: [HoneypotController],
  providers: [
    AnalyzeTokenHoneypotUseCase,
    GetHoneypotAnalysisUseCase,
    ListHoneypotAnalysesUseCase,
    TokenScoredHandler,
    {
      provide: HoneypotAnalyzerPort,
      useClass: HeuristicHoneypotAnalyzerAdapter,
    },
    {
      provide: HoneypotAnalysisRepository,
      useClass: InMemoryHoneypotAnalysisRepository,
    },
  ],
  exports: [HoneypotAnalysisRepository],
})
export class HoneypotModule {}
