import { Test } from '@nestjs/testing';
import { ChainModule } from 'chain/chain.module';
import { ProviderModule } from 'provider/provider.module';
import { AddressModule } from './address.module';
import { AddressKindDetectorService } from './address-kind-detector.service';
import { AddressSnapshotService } from './address-snapshot.service';

describe('AddressModule', () => {
  it('wires detector + snapshot services', async () => {
    const module = await Test.createTestingModule({
      imports: [ChainModule, ProviderModule, AddressModule],
    }).compile();
    expect(module.get(AddressModule)).toBeDefined();
    expect(module.get(AddressKindDetectorService)).toBeDefined();
    expect(module.get(AddressSnapshotService)).toBeDefined();
  });
});
