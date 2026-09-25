import { Injectable, NotFoundException } from '@nestjs/common';
import { ChainCatalogPort } from 'chain/application/ports/chain-catalog.port';
import { ProviderRegistryService } from 'provider/application/provider-registry.service';
import { AddressIdVo } from 'address/domain/address-id.vo';
import {
  AddressKindDetectorService,
} from 'address/application/address-kind-detector.service';
import {
  AddressSnapshot,
  AddressSnapshotInput,
} from '../domain/snapshot.types';

/**
 * AddressSnapshotService (Tramo 3, P45; canonical home todo 12, P50).
 *
 * The absorbed token path: kind=token snapshots compose exactly what
 * the old token shell did (chain validation + supporting-provider
 * hints). Every other kind rides the same shape — one snapshot per
 * kind. Chain qualifier is mandatory: empty chain throws, unknown
 * chain 404s (never a silent null). Full aggregators land in todo 3 —
 * status stays `pending` until then.
 */
@Injectable()
export class AddressSnapshotService {
  public constructor(
    private readonly catalog: ChainCatalogPort,
    private readonly providers: ProviderRegistryService,
    private readonly kinds: AddressKindDetectorService,
  ) {}

  public async getSnapshot(input: AddressSnapshotInput): Promise<AddressSnapshot> {
    const chain = (input.chain ?? '').trim();
    if (chain === '') {
      throw new NotFoundException('Chain qualifier is required');
    }
    const known = await this.catalog.findById(chain);
    if (known === null) {
      throw new NotFoundException(`Unknown chain: ${chain}`);
    }
    const kind = await this.kinds.detect({
      chain: known.id,
      value: input.value,
      kindHint: input.kindHint,
      probe: input.probe ?? null,
    });
    const id = AddressIdVo.from(known.id, input.value, kind);
    const supporting = this.providers
      .listProviders()
      .filter((provider) => provider.supportsChains.includes(known.id))
      .map((provider) => provider.name);
    return {
      chain: id.chain,
      address: id.address,
      kind: id.kind,
      key: id.key,
      status: 'pending',
      providers: supporting,
    };
  }
}
