import { Injectable, Logger } from '@nestjs/common';
import { BirdeyeService } from 'provider/infrastructure/birdeye/birdeye.service';
import { HeliusService } from 'provider/infrastructure/helius/helius.service';
import { DevHoldingsPort } from '../domain/holdings.port';
import {
  emptyDevHoldings,
  type DevHoldingsResult,
  type DevWalletHolding,
} from '../domain/dev-holdings.types';

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

@Injectable()
export class DevHoldingsService extends DevHoldingsPort {
  private readonly logger = new Logger(DevHoldingsService.name);

  public constructor(
    private readonly birdeye: BirdeyeService,
    private readonly helius: HeliusService,
  ) {
    super();
  }

  public async resolve(
    chain: string,
    mint: string,
  ): Promise<DevHoldingsResult> {
    const providerErrors: Record<string, string> = {};
    if (chain !== 'solana') {
      return emptyDevHoldings({
        birdeye: 'unsupported chain',
        helius: 'unsupported chain',
      });
    }
    try {
      const [profile, positions] = await Promise.all([
        this.birdeye.getHolderProfile(mint, chain),
        this.birdeye.getDevPositions(mint, chain, 10),
      ]);
      const wallets = this.fromBirdeye(positions, profile);
      if (wallets !== null) {
        return {
          devWallets: wallets.wallets,
          devPctSupply: wallets.pct,
          source: 'birdeye',
          providerErrors,
        };
      }
      providerErrors['birdeye'] = 'no data';
    } catch (err) {
      providerErrors['birdeye'] =
        err instanceof Error ? err.message : String(err);
    }
    try {
      const probable = await this.fromHelius(mint);
      if (probable !== null) {
        return {
          devWallets: probable.wallets,
          devPctSupply: null,
          source: 'helius-probable',
          providerErrors,
        };
      }
      providerErrors['helius'] = 'no data';
    } catch (err) {
      providerErrors['helius'] =
        err instanceof Error ? err.message : String(err);
    }
    this.logger.debug(`dev holdings unresolved for ${mint}`);
    return emptyDevHoldings(providerErrors);
  }

  private fromBirdeye(
    positions: Awaited<ReturnType<BirdeyeService['getDevPositions']>>,
    profile: Awaited<ReturnType<BirdeyeService['getHolderProfile']>>,
  ): {
    readonly wallets: ReadonlyArray<DevWalletHolding>;
    readonly pct: number | null;
  } | null {
    const items = positions?.items ?? [];
    if (items.length === 0) {
      const devTag = (profile?.tags ?? []).find((t) => t.tag === 'dev');
      if (!devTag) return null;
      const pct = toNumber(
        devTag.percentOfSupply ?? profile?.devPercentOfSupply ?? null,
      );
      if (pct === null && toNumber(devTag.holdAmount) === null) return null;
      return {
        wallets: [
          {
            wallet: profile?.address ?? 'dev',
            holdAmount: toNumber(
              devTag.holdAmount ?? profile?.devHoldAmount ?? null,
            ),
            percentOfSupply: pct,
            pnlUsd: toNumber(devTag.pnlUsd ?? profile?.devPnlUsd ?? null),
            tag: 'dev',
          },
        ],
        pct,
      };
    }
    const wallets: Array<DevWalletHolding> = items.slice(0, 10).map((it) => ({
      wallet: it.wallet,
      holdAmount: toNumber(it.holdAmount),
      percentOfSupply: toNumber(it.percentOfSupply),
      pnlUsd: toNumber(it.pnlUsd),
      tag: it.tag ?? 'dev',
    }));
    const pct = wallets.reduce<number>(
      (acc, w) => acc + (w.percentOfSupply ?? 0),
      0,
    );
    const hasAny = wallets.some(
      (w) => w.holdAmount !== null || w.percentOfSupply !== null,
    );
    if (!hasAny) return null;
    return {
      wallets,
      pct: pct > 0 ? pct : (wallets[0]?.percentOfSupply ?? null),
    };
  }

  private async fromHelius(
    mint: string,
  ): Promise<{ readonly wallets: ReadonlyArray<DevWalletHolding> } | null> {
    const first = await this.helius.getFirstTxFeePayer(mint);
    if (!first) return null;
    return {
      wallets: [
        {
          wallet: first.wallet,
          holdAmount: null,
          percentOfSupply: null,
          pnlUsd: null,
          tag: 'dev-probable',
          probable: true,
        },
      ],
    };
  }
}
