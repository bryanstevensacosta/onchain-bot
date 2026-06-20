import { AnalyzeTokenHoneypotUseCase } from 'ca/honeypot/application/handlers/analyze-token-honeypot.use-case';
import {
  HoneypotAnalyzerPort,
  HoneypotAnalysisResult,
} from 'ca/honeypot/domain/ports/honeypot-analyzer.port';
import { HoneypotAnalysisRepository } from 'ca/honeypot/application/ports/honeypot-analysis.repository';
import { HoneypotAnalysis } from 'ca/honeypot/domain/entities/honeypot-analysis.entity';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { HoneypotSignal } from 'ca/honeypot/domain/value-objects/honeypot-signal.vo';

class FakeAnalyzer extends HoneypotAnalyzerPort {
  public constructor(private readonly nextResult: HoneypotAnalysisResult) {
    super();
  }
  public analyze(): Promise<HoneypotAnalysisResult> {
    return Promise.resolve(this.nextResult);
  }
}

class InMemoryRepo extends HoneypotAnalysisRepository {
  public readonly store = new Map<string, HoneypotAnalysis>();
  public async save(a: HoneypotAnalysis): Promise<void> {
    await Promise.resolve();
    this.store.set(a.id, a);
  }
  public async findByChainAndAddress(
    c: ChainId,
    addr: string,
  ): Promise<HoneypotAnalysis | null> {
    await Promise.resolve();
    return this.store.get(`${c.value}:${addr.toLowerCase()}`) ?? null;
  }
  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<HoneypotAnalysis>> {
    await Promise.resolve();
    return Array.from(this.store.values()).slice(-limit).reverse();
  }
}

const EVM = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

describe('AnalyzeTokenHoneypotUseCase', () => {
  it('produces SAFE analysis when no signals detected', async () => {
    const repo = new InMemoryRepo();
    const analyzer = new FakeAnalyzer({
      signals: [],
      buyTax: 0,
      sellTax: 0,
      transferTax: 0,
      canSell: true,
      canBuy: true,
      ownerCanDrain: false,
      ownerRenounced: true,
      isProxy: false,
      analysisSource: 'HEURISTIC',
    });
    const useCase = new AnalyzeTokenHoneypotUseCase(analyzer, repo);

    const analysis = await useCase.execute({ chain: 'ethereum', address: EVM });

    expect(analysis.risk.value).toBe('SAFE');
    expect(analysis.isLikelyHoneypot).toBe(false);
    expect(repo.store.size).toBe(1);
  });

  it('produces CRITICAL analysis for likely honeypot', async () => {
    const repo = new InMemoryRepo();
    const analyzer = new FakeAnalyzer({
      signals: [
        HoneypotSignal.create({
          type: 'HONEYPOT_FLAG',
          severity: 'CRITICAL',
          description: 'drained',
        }),
      ],
      buyTax: null,
      sellTax: null,
      transferTax: null,
      canSell: false,
      canBuy: true,
      ownerCanDrain: true,
      ownerRenounced: false,
      isProxy: null,
      analysisSource: 'HEURISTIC',
    });
    const useCase = new AnalyzeTokenHoneypotUseCase(analyzer, repo);

    const analysis = await useCase.execute({ chain: 'ethereum', address: EVM });

    expect(analysis.risk.value).toBe('CRITICAL');
    expect(analysis.isLikelyHoneypot).toBe(true);
  });

  it('emits analysis on every call (not gated by risk)', async () => {
    const repo = new InMemoryRepo();
    const analyzer = new FakeAnalyzer({
      signals: [],
      buyTax: null,
      sellTax: null,
      transferTax: null,
      canSell: null,
      canBuy: null,
      ownerCanDrain: null,
      ownerRenounced: null,
      isProxy: null,
      analysisSource: 'HEURISTIC',
    });
    const useCase = new AnalyzeTokenHoneypotUseCase(analyzer, repo);

    const analysis = await useCase.execute({ chain: 'ethereum', address: EVM });
    analysis.emit();

    // Just ensure no exception thrown
    expect(analysis.risk.value).toBe('SAFE');
  });
});
