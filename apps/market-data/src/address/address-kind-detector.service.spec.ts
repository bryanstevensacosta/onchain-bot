import { AddressKindDetectorService } from './address-kind-detector.service';

describe('AddressKindDetectorService', () => {
  const detector = new AddressKindDetectorService();

  it('detects a wallet via EVM format + wallet probe (isContract=false)', async () => {
    await expect(
      detector.detect({
        chain: 'ethereum',
        value: '0x0000000000000000000000000000000000000001',
        probe: { responded: true, isContract: false },
      }),
    ).resolves.toBe('wallet');
  });

  it('detects a token via EVM format + contract probe (isContract=true)', async () => {
    await expect(
      detector.detect({
        chain: 'ethereum',
        value: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        probe: { responded: true, isContract: true },
      }),
    ).resolves.toBe('token');
  });

  it('detects a program via the known-program registry (solana system program)', async () => {
    await expect(
      detector.detect({
        chain: 'solana',
        value: '11111111111111111111111111111111',
      }),
    ).resolves.toBe('program');
  });

  it('detects an exchange via an injected known-exchange address', async () => {
    const withExchange = new AddressKindDetectorService({
      exchanges: ['ethereum:0x0000000000000000000000000000000000000002'],
    });
    await expect(
      withExchange.detect({
        chain: 'ethereum',
        value: '0x0000000000000000000000000000000000000002',
      }),
    ).resolves.toBe('exchange');
  });

  it('honours an explicit valid kind hint over format/probe', async () => {
    await expect(
      detector.detect({
        chain: 'solana',
        value: 'So11111111111111111111111111111111111111112',
        kindHint: 'exchange',
      }),
    ).resolves.toBe('exchange');
  });

  it('returns explicit unknown (no crash) for garbage input', async () => {
    await expect(
      detector.detect({ chain: 'ethereum', value: 'not-an-address' }),
    ).resolves.toBe('unknown');
  });

  it('returns explicit unknown (no crash) for an unknown chain', async () => {
    await expect(
      detector.detect({ chain: 'nopechain', value: '0xabc' }),
    ).resolves.toBe('unknown');
  });

  it('returns explicit unknown (no crash) for an invalid kind hint', async () => {
    await expect(
      detector.detect({
        chain: 'ethereum',
        value: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        kindHint: 'vault',
      }),
    ).resolves.toBe('unknown');
  });

  it('returns explicit unknown (no crash) for empty/missing values', async () => {
    await expect(detector.detect({ chain: '', value: '' })).resolves.toBe(
      'unknown',
    );
    await expect(
      detector.detect({ chain: 'solana', value: '   ' }),
    ).resolves.toBe('unknown');
  });
});
