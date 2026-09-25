import { Inject, Injectable } from '@nestjs/common';
import { ChainCatalogPort } from './ports/chain-catalog.port';
import { CHAIN_PROBERS, ChainProberPort } from './ports/chain-prober.port';

export interface DetectChainResult {
  readonly chainId: string;
  readonly points: number;
  readonly reasons: ReadonlyArray<string>;
}

/**
 * DetectChainService (Tramo 3, todo 2).
 *
 * Ports the backend DetectChainUseCase coordination rule (read-only
 * reference): probers run in parallel via Promise.allSettled so one
 * prober outage never blocks detection; every zero-score run throws
 * an explicit error instead of a silent null.
 */
@Injectable()
export class DetectChainService {
  public constructor(
    @Inject(CHAIN_PROBERS)
    private readonly probers: ReadonlyArray<ChainProberPort>,
    private readonly catalog: ChainCatalogPort,
  ) {
    if (probers.length === 0) {
      throw new Error('DetectChainService requires at least one ChainProberPort');
    }
  }

  public async detect(address: string): Promise<DetectChainResult> {
    const trimmed = (address ?? '').trim();
    if (trimmed === '') {
      throw new Error('address cannot be empty');
    }

    const settled = await Promise.allSettled(this.probers.map((prober) => prober.probe(trimmed)));

    let best: DetectChainResult | null = null;
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const prober = this.probers[i];
      if (result.status === 'rejected') {
        continue;
      }
      if (!result.value.responded) {
        continue;
      }
      const candidate: DetectChainResult = {
        chainId: prober.chainName,
        points: 70,
        reasons: [...result.value.notes],
      };
      if (best === null || candidate.points > best.points) {
        best = candidate;
      }
    }

    if (best === null) {
      throw new Error(`No chain matched address: ${trimmed}`);
    }

    const known = await this.catalog.findById(best.chainId);
    if (known === null) {
      throw new Error(`No chain matched address: ${trimmed}`);
    }
    return best;
  }
}
