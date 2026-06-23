import { Injectable } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import { HoneypotAnalysis } from 'token/honeypot/domain/entities/honeypot-analysis.entity';
import { HoneypotAnalyzerPort } from 'token/honeypot/domain/ports/honeypot-analyzer.port';
import { HoneypotAnalysisRepository } from 'token/honeypot/application/ports/honeypot-analysis.repository';

export interface AnalyzeTokenInput {
  readonly chain: string;
  readonly address: string;
}

/**
 * Use case: run honeypot analysis on a token contract and persist the result.
 *
 * Always emits a `honeypot.analysis.completed` event so other BCs can react.
 */
@Injectable()
export class AnalyzeTokenHoneypotUseCase {
  public constructor(
    private readonly analyzer: HoneypotAnalyzerPort,
    private readonly repo: HoneypotAnalysisRepository,
  ) {}

  public async execute(input: AnalyzeTokenInput): Promise<HoneypotAnalysis> {
    const chain = ChainId.fromString(input.chain);
    const result = await this.analyzer.analyze(chain.value, input.address);

    const analysis = HoneypotAnalysis.create({
      chain,
      address: input.address,
      signals: result.signals,
      buyTax: result.buyTax,
      sellTax: result.sellTax,
      transferTax: result.transferTax,
      canSell: result.canSell,
      canBuy: result.canBuy,
      ownerCanDrain: result.ownerCanDrain,
      ownerRenounced: result.ownerRenounced,
      isProxy: result.isProxy,
      analysisSource: result.analysisSource,
    });

    await this.repo.save(analysis);
    analysis.emit();
    return analysis;
  }
}
