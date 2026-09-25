import { Test } from '@nestjs/testing';
import { SnapshotModule } from 'snapshot/snapshot.module';
import { AddressModule } from './address.module';
import { AddressKindDetectorService } from './application/address-kind-detector.service';
import { AddressSnapshotService } from 'snapshot/application/address-snapshot.service';

describe('AddressModule', () => {
  it('wires detector + snapshot services', async () => {
    const module = await Test.createTestingModule({
      imports: [AddressModule, SnapshotModule],
    }).compile();
    expect(module.get(AddressModule)).toBeDefined();
    expect(module.get(AddressKindDetectorService)).toBeDefined();
    expect(module.get(AddressSnapshotService)).toBeDefined();
  });
});
