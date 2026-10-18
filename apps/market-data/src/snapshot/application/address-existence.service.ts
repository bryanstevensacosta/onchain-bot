import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ChainCatalogPort } from 'chain/application/ports/chain-catalog.port';
import { AlchemyService } from 'provider/infrastructure/alchemy/alchemy.service';
import { SolanaRpcService } from 'provider/infrastructure/solana-rpc';
import { resolveExistenceDeadlineMs } from '../domain/snapshot-latency';

/**
 * Existence verdict (dexter plan todo 21b).
 *
 * - `exists`: chain answered definitively that the account is there.
 * - `missing`: chain answered definitively that it is NOT (empty EVM
 *   code on a token-kind ask, zero-nonce EOA on unknown-kind, or a
 *   Solana `value: null` account read).
 * - `unresolved`: anything else — unknown chain, malformed address,
 *   transport gap, or deadline. The snapshot proceeds exactly as if
 *   no probe existed (fail-open).
 */
export type ExistenceVerdict = 'exists' | 'missing' | 'unresolved';

export interface ExistenceProbeResult {
  readonly verdict: ExistenceVerdict;
  /** Human-readable reason (rides `providerErrors.existence` on `missing`). */
  readonly reason: string;
  /** Wall-clock ms spent in the probe (deadline included). */
  readonly ms: number;
}

/** 0x + 40 hex — the only EVM shape either RPC method is asked about. */
const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/** Base58 alphabet, 32-44 chars (the public Solana address envelope). */
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * AddressExistenceService (dexter plan todo 21b): the pre-fan-out
 * existence gate. A definitively-dead address answers `invalid` fast
 * (no provider fan-out, no tail, no ATH work); everything ambiguous
 * fails open.
 *
 * EVM:
 * - `eth_getCode` non-empty -> EXISTS (contract bytecode present).
 * - Empty code + kind `token` -> MISSING (a token that is not a
 *   contract cannot exist; `0x`/`''` is definitive).
 * - Empty code + kind `unknown` -> `eth_getTransactionCount`: zero
 *   nonce is a never-used address -> MISSING; non-zero -> EXISTS (a
 *   funded EOA is real); transport gap -> unresolved.
 *
 * Solana: one `getAccountInfo` walk over the existing tiers — a
 * well-formed answer with `value: null` is definitive MISSING
 * (`probeAccountExistence` on `SolanaRpcService`); any tier transport
 * failure falls through; all tiers exhausted -> unresolved.
 *
 * Every call runs a private `SNAPSHOT_EXISTENCE_DEADLINE_MS` race
 * (default 800ms): on expiry the verdict is `unresolved` — the probe
 * never blocks the serve and never throws. Both RPC clients are
 * `@Optional()`: absent (hand-built specs) means unresolved.
 */
@Injectable()
export class AddressExistenceService {
  private readonly logger = new Logger(AddressExistenceService.name);

  /** Read once at construction, same pattern as the other budget fields. */
  private readonly deadlineMs: number = resolveExistenceDeadlineMs(
    process.env['SNAPSHOT_EXISTENCE_DEADLINE_MS'],
  );

  public constructor(
    private readonly catalog: ChainCatalogPort,
    // Union-typed params emit `Object` metadata: explicit `@Inject` is
    // mandatory (same documented pattern as the snapshot service).
    @Optional()
    @Inject(AlchemyService)
    private readonly alchemy: AlchemyService | null = null,
    @Optional()
    @Inject(SolanaRpcService)
    private readonly solanaRpc: SolanaRpcService | null = null,
  ) {}

  /**
   * Probe one address. Never throws; always answers a verdict within
   * the deadline (the race resolves `unresolved` on expiry and the
   * abandoned inner promise is observed by the race — transport
   * clients fail open on their own timeouts).
   */
  public async probe(
    chain: string,
    address: string,
    kind: string,
  ): Promise<ExistenceProbeResult> {
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const raced = await Promise.race([
        this.probeInner(chain, address, kind),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), this.deadlineMs);
          if (timer !== null && typeof timer.unref === 'function') {
            timer.unref();
          }
        }),
      ]);
      if (raced === null) {
        return {
          verdict: 'unresolved',
          reason: `existence probe exceeded ${this.deadlineMs}ms deadline — fail-open`,
          ms: Date.now() - startedAt,
        };
      }
      return { ...raced, ms: Date.now() - startedAt };
    } catch (err) {
      return {
        verdict: 'unresolved',
        reason: `existence probe failed (${(err as Error).message}) — fail-open`,
        ms: Date.now() - startedAt,
      };
    } finally {
      if (timer !== null) {
        clearTimeout(timer);
      }
    }
  }

  private async probeInner(
    chain: string,
    address: string,
    kind: string,
  ): Promise<{ readonly verdict: ExistenceVerdict; readonly reason: string }> {
    let known: Awaited<ReturnType<ChainCatalogPort['findById']>> = null;
    try {
      known = await this.catalog.findById(chain);
    } catch {
      return { verdict: 'unresolved', reason: 'chain catalog unavailable — fail-open' };
    }
    if (known === null) {
      return { verdict: 'unresolved', reason: 'unknown chain — fail-open' };
    }
    if (known.family === 'EVM') {
      return this.probeEvm(chain, address, kind);
    }
    if (known.family === 'SOLANA') {
      return this.probeSolana(address, kind);
    }
    return { verdict: 'unresolved', reason: 'unsupported chain family — fail-open' };
  }

  private async probeEvm(
    chain: string,
    address: string,
    kind: string,
  ): Promise<{ readonly verdict: ExistenceVerdict; readonly reason: string }> {
    if (!EVM_ADDRESS_PATTERN.test(address)) {
      return {
        verdict: 'unresolved',
        reason: 'unrecognized EVM address format — fail-open',
      };
    }
    const alchemy = this.alchemy;
    if (alchemy === null || alchemy === undefined) {
      return { verdict: 'unresolved', reason: 'EVM RPC unavailable — fail-open' };
    }
    const code = await alchemy.getCode(chain, address);
    if (typeof code !== 'string') {
      return {
        verdict: 'unresolved',
        reason: 'eth_getCode unavailable — fail-open',
      };
    }
    const trimmed = code.trim().toLowerCase();
    if (trimmed !== '' && trimmed !== '0x') {
      return { verdict: 'exists', reason: 'contract bytecode present' };
    }
    // Empty code: EOA or dead. Definitive only for a token ask.
    if (kind === 'token') {
      return {
        verdict: 'missing',
        reason: 'no contract bytecode (eth_getCode returned empty)',
      };
    }
    const nonce = await alchemy.getTransactionCount(chain, address);
    if (typeof nonce !== 'string' || !/^0x[0-9a-fA-F]+$/.test(nonce.trim())) {
      return {
        verdict: 'unresolved',
        reason: 'eth_getTransactionCount unavailable — fail-open',
      };
    }
    if (/^0x0*$/.test(nonce.trim())) {
      return {
        verdict: 'missing',
        reason: 'no contract bytecode and zero transaction count',
      };
    }
    return { verdict: 'exists', reason: 'EOA with transaction history' };
  }

  private async probeSolana(
    address: string,
    kind: string,
  ): Promise<{ readonly verdict: ExistenceVerdict; readonly reason: string }> {
    if (!SOLANA_ADDRESS_PATTERN.test(address)) {
      return {
        verdict: 'unresolved',
        reason: 'unrecognized Solana address format — fail-open',
      };
    }
    const rpc = this.solanaRpc;
    if (rpc === null || rpc === undefined) {
      return {
        verdict: 'unresolved',
        reason: 'Solana RPC unavailable — fail-open',
      };
    }
    const verdict = await rpc.probeAccountExistence(address);
    if (verdict === 'exists') {
      return { verdict: 'exists', reason: 'account present' };
    }
    if (verdict === 'missing') {
      return {
        verdict: 'missing',
        reason:
          kind === 'token'
            ? 'no account for mint (getAccountInfo returned null)'
            : 'no account (getAccountInfo returned null)',
      };
    }
    return {
      verdict: 'unresolved',
      reason: 'account probe unresolved across tiers — fail-open',
    };
  }
}
