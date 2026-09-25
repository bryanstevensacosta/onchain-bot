import { StaticChainCatalog } from './static-chain-catalog';
import { DetectChainService } from './application/detect-chain.service';
import { EvmChainProber } from './infrastructure/probers/evm-chain.prober';
import { SolanaChainProber } from './infrastructure/probers/solana-chain.prober';

/**
 * Failing-first spec (Tramo 3, todo 2): detect-chain use case.
 *
 * Ports the backend DetectChainUseCase coordination rule (read-only
 * reference): probers run in parallel, one RPC outage never blocks
 * detection, zero scores throw an explicit error.
 */
describe('DetectChainService', () => {
  const service = new DetectChainService(
    [new EvmChainProber(), new SolanaChainProber()],
    new StaticChainCatalog(),
  );

  it('detects an EVM address as ethereum', async () => {
    const result = await service.detect('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    expect(result.chainId).toBe('ethereum');
    expect(result.points).toBeGreaterThan(0);
  });

  it('detects a Solana address as solana', async () => {
    const result = await service.detect('So11111111111111111111111111111111111111112');
    expect(result.chainId).toBe('solana');
  });

  it('throws an explicit error when no chain matches', async () => {
    await expect(service.detect('!!!')).rejects.toThrow(/no chain matched/i);
  });

  it('rejects an empty address', async () => {
    await expect(service.detect('   ')).rejects.toThrow(/empty/i);
  });
});
