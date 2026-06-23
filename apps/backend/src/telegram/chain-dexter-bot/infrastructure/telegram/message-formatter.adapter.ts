import { Injectable } from '@nestjs/common';
import { TokenScanResult } from '../../application/token-scan.service';

@Injectable()
export class MessageFormatterAdapter {
  public format(tokenInfo: TokenScanResult): string {
    const { formatNumber, formatPercent, formatAge, formatMoney } = this;

    const header = `💊 $${tokenInfo.symbol} | ${tokenInfo.name}`;
    const mc = formatMoney(tokenInfo.marketCapUsd);
    const fdv = formatMoney(tokenInfo.fdvUsd);
    const ath = formatMoney(tokenInfo.athUsd);
    const athChange = formatPercent(tokenInfo.athPercentChange);
    const athAge = tokenInfo.athDaysAgo
      ? formatAge(tokenInfo.athDaysAgo)
      : 'N/A';
    const price = formatMoney(tokenInfo.priceUsd);
    const priceChange = formatPercent(tokenInfo.priceChange24h);
    const liq = formatMoney(tokenInfo.liquidityUsd);
    const liqLocked = formatPercent(tokenInfo.liquidityLockedPercent);
    const liqBurned = formatPercent(tokenInfo.liquidityBurnedPercent);
    const vol = formatMoney(tokenInfo.volume24hUsd);
    const holders = formatNumber(tokenInfo.holders);
    const top10 = formatPercent(tokenInfo.top10HolderPercent);
    const top20 = formatPercent(tokenInfo.top20HolderPercent);

    return `${header}

📊 Token Info
├ MC:      ${mc}
├ FDV:     ${fdv}
├ ATH:     ${ath}
│  └ ${athChange} • ${athAge}
├ USD:     ${price} (${priceChange})
├ LIQ:     ${liq}
│  ├ Locked: ${liqLocked}
│  └ Burned: ${liqBurned}
├ VOL:     ${vol}
└ HOLDERS: ${holders}
   ├ Top 10: ${top10}
   └ Top 20: ${top20}`;
  }

  private formatNumber(value: number | null): string {
    if (value === null || value === undefined) return 'N/A';
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
  }

  private formatMoney(value: number | null): string {
    if (value === null || value === undefined) return 'N/A';
    if (value >= 1_000_000_000)
      return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  }

  private formatPercent(value: number | null): string {
    if (value === null || value === undefined) return 'N/A';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }

  private formatAge(days: number): string {
    if (days >= 365) return `${Math.floor(days / 365)}y ago`;
    if (days >= 30) return `${Math.floor(days / 30)}mo ago`;
    if (days >= 1) return `${days}d ago`;
    return 'today';
  }
}
