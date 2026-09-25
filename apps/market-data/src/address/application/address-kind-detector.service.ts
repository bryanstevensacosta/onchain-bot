import { Inject, Injectable, Optional } from '@nestjs/common';
import { AddressKind, isAddressKind } from '../domain/address-kind';
import { AddressProbe } from '../domain/address-probe.port';
import { KNOWN_PROGRAM_KEYS } from '../infrastructure/known-addresses.seed';

export interface DetectKindInput {
  readonly chain: string;
  readonly value: string;
  readonly kindHint?: unknown;
  readonly probe?: AddressProbe | null;
}

export interface KnownAddressRegistries {
  readonly programs?: ReadonlyArray<string>;
  readonly exchanges?: ReadonlyArray<string>;
}

/**
 * DI token for optional known-address registries. Unprovided in
 * production wiring (static v1 seed applies); tests inject fixtures
 * via direct construction instead.
 */
export const ADDRESS_REGISTRIES = 'ADDRESS_REGISTRIES';

const EVM_ADDRESS_FORMAT = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS_FORMAT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * AddressKindDetectorService (Tramo 3, P45; hexagonal home todo 12, P50).
 *
 * Kind detection = explicit hint > known registries > on-chain probe >
 * format. Format-only evidence NEVER guesses wallet-vs-token (same
 * alphabet on EVM/Solana): it returns explicit `unknown`. Nothing here
 * throws on bad input — garbage in, `unknown` out.
 */
@Injectable()
export class AddressKindDetectorService {
  private readonly programs: ReadonlySet<string>;
  private readonly exchanges: ReadonlySet<string>;

  public constructor(
    @Optional()
    @Inject(ADDRESS_REGISTRIES)
    registries?: KnownAddressRegistries,
  ) {
    this.programs = new Set(
      [...KNOWN_PROGRAM_KEYS, ...(registries?.programs ?? [])].map((key) =>
        key.trim().toLowerCase(),
      ),
    );
    this.exchanges = new Set(
      (registries?.exchanges ?? []).map((key) => key.trim().toLowerCase()),
    );
  }

  public async detect(input: DetectKindInput): Promise<AddressKind> {
    const chain = (input.chain ?? '').trim().toLowerCase();
    const value = (input.value ?? '').trim();
    if (chain === '' || value === '') {
      return 'unknown';
    }
    if (input.kindHint !== undefined && input.kindHint !== null) {
      if (isAddressKind(input.kindHint)) {
        return input.kindHint;
      }
      return 'unknown';
    }
    const key = `${chain}:${value.toLowerCase()}`;
    if (this.exchanges.has(key)) {
      return 'exchange';
    }
    if (this.programs.has(key)) {
      return 'program';
    }
    if (!this.hasKnownFormat(chain, value)) {
      return 'unknown';
    }
    const probe = input.probe ?? null;
    if (probe !== null && probe.responded && probe.isContract !== null) {
      if (probe.isContract) {
        return chain === 'solana' ? 'program' : 'token';
      }
      return 'wallet';
    }
    return 'unknown';
  }

  private hasKnownFormat(chain: string, value: string): boolean {
    if (chain === 'solana') {
      return SOLANA_ADDRESS_FORMAT.test(value);
    }
    return EVM_ADDRESS_FORMAT.test(value);
  }
}
