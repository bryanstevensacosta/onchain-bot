import { EvmChainProber } from './infrastructure/probers/evm-chain.prober';
import { SolanaChainProber } from './infrastructure/probers/solana-chain.prober';

/**
 * Failing-first spec (Tramo 3, todo 2): format probers.
 *
 * v1 is format-only (no RPC): EVM = 0x + 40 hex, Solana = base58 32-44.
 * RPC-backed probing lands with the todo-4 provider extraction.
 */
describe('chain probers (v1 format-only)', () => {
  it('EVM accepts a valid 0x address', async () => {
    const prober = new EvmChainProber();
    const result = await prober.probe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    expect(result.responded).toBe(true);
  });

  it('EVM rejects a non-hex address', async () => {
    const prober = new EvmChainProber();
    const result = await prober.probe('not-an-address');
    expect(result.responded).toBe(false);
    expect(result.isContract).toBeNull();
  });

  it('Solana accepts a valid base58 address', async () => {
    const prober = new SolanaChainProber();
    const result = await prober.probe('So11111111111111111111111111111111111111112');
    expect(result.responded).toBe(true);
  });

  it('Solana rejects an EVM address', async () => {
    const prober = new SolanaChainProber();
    const result = await prober.probe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    expect(result.responded).toBe(false);
    expect(result.isContract).toBeNull();
  });
});
