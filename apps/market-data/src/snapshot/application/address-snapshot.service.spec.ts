import { Test } from '@nestjs/testing';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';

describe('AddressSnapshotService (snapshot per kind)', () => {
  let snapshots: AddressSnapshotService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [SnapshotModule],
    }).compile();
    snapshots = module.get(AddressSnapshotService);
  });

  it('snapshots kind=token (the absorbed token path)', async () => {
    const snapshot = await snapshots.getSnapshot({
      chain: 'solana',
      value: 'So11111111111111111111111111111111111111112',
      kindHint: 'token',
    });
    expect(snapshot.chain).toBe('solana');
    expect(snapshot.kind).toBe('token');
    expect(snapshot.status).toBe('pending');
    expect(Array.isArray(snapshot.providers)).toBe(true);
  });

  it('snapshots kind=wallet', async () => {
    const snapshot = await snapshots.getSnapshot({
      chain: 'ethereum',
      value: '0x0000000000000000000000000000000000000001',
      kindHint: 'wallet',
    });
    expect(snapshot.kind).toBe('wallet');
    expect(snapshot.status).toBe('pending');
  });

  it('snapshots kind=program', async () => {
    const snapshot = await snapshots.getSnapshot({
      chain: 'solana',
      value: '11111111111111111111111111111111',
    });
    expect(snapshot.kind).toBe('program');
  });

  it('snapshots kind=exchange', async () => {
    const snapshot = await snapshots.getSnapshot({
      chain: 'solana',
      value: 'So11111111111111111111111111111111111111112',
      kindHint: 'exchange',
    });
    expect(snapshot.kind).toBe('exchange');
  });

  it('snapshots unknown kind explicitly instead of crashing', async () => {
    const snapshot = await snapshots.getSnapshot({
      chain: 'ethereum',
      value: 'not-an-address',
      kindHint: 'vault',
    });
    expect(snapshot.kind).toBe('unknown');
    expect(snapshot.status).toBe('pending');
  });

  it('requires a chain qualifier (mandatory)', async () => {
    await expect(
      snapshots.getSnapshot({ chain: '', value: '0xabc' }),
    ).rejects.toThrow();
  });
});
