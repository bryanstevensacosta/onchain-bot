import { ChainCatalogPort } from 'chain/application/ports/chain-catalog.port';
import { AddressExistenceService } from './address-existence.service';

/**
 * AddressExistenceService unit pins (dexter plan todo 21b). Pure
 * construction with fake catalog + fake transports — this suite never
 * touches the network; hermetic DI suites stub the SERVICE (this file
 * pins its internals).
 */

const EVM = '0xAbCd000000000000000000000000000000000001';
const SOL = 'So11111111111111111111111111111111111111112';

type Verdict = 'exists' | 'missing' | 'unresolved';

function catalogOf(
  family: 'EVM' | 'SOLANA' | null,
  calls?: string[],
): ChainCatalogPort {
  return {
    findById: async (id: string) => {
      calls?.push(`findById:${id}`);
      if (family === null) return null;
      return { id, family } as never;
    },
    listAll: async () => [],
    listByFamily: async () => [],
  } as unknown as ChainCatalogPort;
}

function throwingCatalog(): ChainCatalogPort {
  return {
    findById: async () => {
      throw new Error('catalog down');
    },
    listAll: async () => [],
    listByFamily: async () => [],
  } as unknown as ChainCatalogPort;
}

function alchemyOf(options: {
  code?: unknown;
  nonce?: unknown;
  codeImpl?: () => Promise<unknown>;
  nonceImpl?: () => Promise<unknown>;
  codeCalls?: string[];
  nonceCalls?: string[];
}): never {
  return {
    getCode: async (chain: string, address: string) => {
      options.codeCalls?.push(`${chain}:${address}`);
      if (options.codeImpl !== undefined) return options.codeImpl();
      return options.code === undefined ? '0x' : options.code;
    },
    getTransactionCount: async (chain: string, address: string) => {
      options.nonceCalls?.push(`${chain}:${address}`);
      if (options.nonceImpl !== undefined) return options.nonceImpl();
      return options.nonce === undefined ? '0x0' : options.nonce;
    },
  } as never;
}

function solanaOf(
  verdict: Verdict,
  calls?: string[],
): never {
  return {
    probeAccountExistence: async (address: string) => {
      calls?.push(address);
      return verdict;
    },
  } as never;
}

async function probe(
  family: 'EVM' | 'SOLANA' | null,
  address: string,
  kind: string,
  deps: {
    alchemy?: never;
    solana?: never;
    catalog?: ChainCatalogPort;
  } = {},
) {
  const service = new AddressExistenceService(
    deps.catalog ?? catalogOf(family),
    deps.alchemy ?? null,
    deps.solana ?? null,
  );
  return service.probe('ethereum', address, kind);
}

describe('AddressExistenceService (dexter plan todo 21b)', () => {
  describe('EVM', () => {
    it('non-empty bytecode -> exists (token or unknown kind alike)', async () => {
      const nonceCalls: string[] = [];
      const result = await probe('EVM', EVM, 'token', {
        alchemy: alchemyOf({ code: '0x6080deadbeef', nonceCalls }),
      });
      expect(result.verdict).toBe('exists');
      expect(result.reason).toContain('bytecode');
      expect(nonceCalls).toHaveLength(0);
    });

    it('empty code on a token ask -> missing (definitive, no nonce read)', async () => {
      const nonceCalls: string[] = [];
      for (const code of ['0x', '']) {
        const result = await probe('EVM', EVM, 'token', {
          alchemy: alchemyOf({ code, nonceCalls }),
        });
        expect(result.verdict).toBe('missing');
        expect(result.reason).toContain('no contract bytecode');
      }
      expect(nonceCalls).toHaveLength(0);
    });

    it('whitespace-padded empty code still resolves missing', async () => {
      const result = await probe('EVM', EVM, 'token', {
        alchemy: alchemyOf({ code: '  0x  ' }),
      });
      expect(result.verdict).toBe('missing');
    });

    it('empty code + unknown kind + zero nonce -> missing', async () => {
      for (const nonce of ['0x0', '0x000000']) {
        const result = await probe('EVM', EVM, 'unknown', {
          alchemy: alchemyOf({ code: '0x', nonce }),
        });
        expect(result.verdict).toBe('missing');
        expect(result.reason).toContain('zero transaction count');
      }
    });

    it('empty code + unknown kind + non-zero nonce -> exists (funded EOA)', async () => {
      const result = await probe('EVM', EVM, 'unknown', {
        alchemy: alchemyOf({ code: '0x', nonce: '0x5' }),
      });
      expect(result.verdict).toBe('exists');
      expect(result.reason).toContain('transaction history');
    });

    it('nonce unavailable -> unresolved (fail-open), never missing', async () => {
      for (const nonce of [null, 'nope']) {
        const result = await probe('EVM', EVM, 'unknown', {
          alchemy: alchemyOf({ code: '0x', nonce }),
        });
        expect(result.verdict).toBe('unresolved');
      }
    });

    it('getCode non-string (transport gap) -> unresolved', async () => {
      const result = await probe('EVM', EVM, 'token', {
        alchemy: alchemyOf({ code: null }),
      });
      expect(result.verdict).toBe('unresolved');
      expect(result.reason).toContain('fail-open');
    });

    it('format garbage -> unresolved with ZERO RPC calls', async () => {
      const codeCalls: string[] = [];
      const result = await probe('EVM', '0x1234', 'token', {
        alchemy: alchemyOf({ codeCalls }),
      });
      expect(result.verdict).toBe('unresolved');
      expect(result.reason).toContain('format');
      expect(codeCalls).toHaveLength(0);
    });

    it('absent transport -> unresolved', async () => {
      const result = await probe('EVM', EVM, 'token', { alchemy: null as never });
      // `null as never` lands as the class default -> unresolved.
      expect(result.verdict).toBe('unresolved');
    });

    it('transport throw -> unresolved, never throws', async () => {
      const result = await probe('EVM', EVM, 'token', {
        alchemy: alchemyOf({
          codeImpl: async () => {
            throw new Error('rpc exploded');
          },
        }),
      });
      expect(result.verdict).toBe('unresolved');
      expect(result.reason).toContain('rpc exploded');
    });
  });

  describe('Solana', () => {
    it('account present -> exists', async () => {
      const result = await probe('SOLANA', SOL, 'token', {
        solana: solanaOf('exists'),
      });
      expect(result.verdict).toBe('exists');
    });

    it('value:null account read -> missing with the mint-flavored reason', async () => {
      const result = await probe('SOLANA', SOL, 'token', {
        solana: solanaOf('missing'),
      });
      expect(result.verdict).toBe('missing');
      expect(result.reason).toContain('no account for mint');
    });

    it('non-token kind missing keeps the plain reason', async () => {
      const result = await probe('SOLANA', SOL, 'unknown', {
        solana: solanaOf('missing'),
      });
      expect(result.verdict).toBe('missing');
      expect(result.reason).toContain('no account');
      expect(result.reason).not.toContain('mint');
    });

    it('all tiers exhausted -> unresolved (fail-open)', async () => {
      const result = await probe('SOLANA', SOL, 'token', {
        solana: solanaOf('unresolved'),
      });
      expect(result.verdict).toBe('unresolved');
    });

    it('absent transport -> unresolved with zero calls', async () => {
      const result = await probe('SOLANA', SOL, 'token');
      expect(result.verdict).toBe('unresolved');
    });

    it('format garbage -> unresolved with zero probe calls', async () => {
      const calls: string[] = [];
      const result = await probe('SOLANA', '0xdeadbeef', 'token', {
        solana: solanaOf('exists', calls),
      });
      expect(result.verdict).toBe('unresolved');
      expect(result.reason).toContain('format');
      expect(calls).toHaveLength(0);
    });
  });

  describe('catalog + deadline', () => {
    it('unknown chain -> unresolved with zero RPC calls', async () => {
      const codeCalls: string[] = [];
      const result = await probe(null, EVM, 'token', {
        alchemy: alchemyOf({ codeCalls }),
      });
      expect(result.verdict).toBe('unresolved');
      expect(result.reason).toContain('unknown chain');
      expect(codeCalls).toHaveLength(0);
    });

    it('catalog throw -> unresolved', async () => {
      const service = new AddressExistenceService(
        throwingCatalog(),
        alchemyOf({ code: '0x6080' }),
        null,
      );
      const result = await service.probe('ethereum', EVM, 'token');
      expect(result.verdict).toBe('unresolved');
      expect(result.reason).toContain('catalog unavailable');
    });

    it('deadline expiry -> unresolved (fail-open), bounded in time', async () => {
      const previous = process.env['SNAPSHOT_EXISTENCE_DEADLINE_MS'];
      process.env['SNAPSHOT_EXISTENCE_DEADLINE_MS'] = '25';
      try {
        const service = new AddressExistenceService(
          catalogOf('EVM'),
          alchemyOf({ codeImpl: () => new Promise(() => {}) }),
          null,
        );
        const started = Date.now();
        const result = await service.probe('ethereum', EVM, 'token');
        const elapsed = Date.now() - started;
        expect(result.verdict).toBe('unresolved');
        expect(result.reason).toContain('deadline');
        expect(elapsed).toBeGreaterThanOrEqual(15);
        expect(elapsed).toBeLessThan(500);
      } finally {
        if (previous === undefined) {
          delete process.env['SNAPSHOT_EXISTENCE_DEADLINE_MS'];
        } else {
          process.env['SNAPSHOT_EXISTENCE_DEADLINE_MS'] = previous;
        }
      }
    });

    it('every verdict carries a finite non-negative ms', async () => {
      const result = await probe('EVM', EVM, 'token', {
        alchemy: alchemyOf({ code: '0x6080' }),
      });
      expect(typeof result.ms).toBe('number');
      expect(Number.isFinite(result.ms)).toBe(true);
      expect(result.ms).toBeGreaterThanOrEqual(0);
    });
  });
});
