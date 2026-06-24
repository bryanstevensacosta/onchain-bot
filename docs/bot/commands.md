# Commands & Message Format

## Notes

There are **no commands**. The bot detects contract addresses and symbols automatically on any message.

## Message Format

Response uses a compact multi-line format inspired by RickBot. Telegram HTML parse_mode is used for links and bold.

### Template

```
💊 [NAME] [[FDV]/[Mcap%]] $[SYMBOL]
🌐 [CHAIN] @ [DEX]
💰 USD: $[PRICE]
💎 FDV: $[FDV] ⇨ ATH: $[ATH] [[ATH_AGE]]
💦 Liq: $[LIQUIDITY] [[LIQ_VOL_RATIO]]
📊 Vol: $[VOLUME24H] 🕰️ Age: [AGE]
📉 [PERIOD]: [CHANGE]% ⋅ $[VOLUME] 🅑 [BUYS] Ⓢ [SELLS]
🖨️ Mint: [MINT_STATUS] ⋅ LP: [LP_PERCENT]%
👥 TH: [HOLDER_PERCENT]% [[TOP_HOLDER_LINKS]]
🧰 More: [🫧 BUBBLEMAP] [🎨 IMAGE] [💬 TELEGRAM] [🌍 WEBSITE] [🐦 TWITTER]
💹 Chart: [DEX] ⋅ [DEF]

[CONTRACT_ADDRESS]
[TAGS]

🛡️ Risk: [STATUS] @ [CONFIDENCE]
```

### Line-by-Line Breakdown

| Line | Prefix | Data | Source |
|------|--------|------|--------|
| 1 | 💊 | Token name, FDV with % of ATH, symbol | DexScreener / CoinGecko |
| 2 | 🌐 | Chain name @ DEX name | DexScreener |
| 3 | 💰 | Current USD price | DexScreener |
| 4 | 💎 | FDV → ATH with age since ATH | DexScreener / CoinGecko |
| 5 | 💦 | Liquidity with volume/liquidity ratio in brackets | DexScreener |
| 6 | 📊 | 24h volume + token age | DexScreener |
| 7 | 📉 | 1H change %, 1H volume, buy/sell counts | DexScreener |
| 8 | 👥 | Top holder concentration % + links to top wallets | Solscan / Etherscan |
| 9 | 🖨️ | Mint authority status + LP locked % | Solscan / Etherscan |
| 10 | 🧰 | Social/utility links as inline emoji-linked URLs | CoinGecko / DexScreener |
| 11 | 💹 | Chart links (DEX, DeFi) | DexScreener |

### Field Reference

| Field | Description | Calculation |
|-------|-------------|-------------|
| Mcap% | Current FDV as % of ATH | `(fdv / athFDV) * 100` |
| Liq/Vol Ratio | Volume multiple of liquidity | `volume24h / liquidity` |
| ATH Age | Days since ATH was reached | `currentTimestamp - athTimestamp` |
| AGE | Token age | `currentTimestamp - creationTimestamp` |
| Period | "1H" by default | Customizable |
| LP% | Percent of LP tokens locked | Derived from lock contracts |
| TH | Top holder concentration | `sum(top10 Balances) / totalSupply * 100` |

## Emoji Icons Reference

```javascript
const ICONS = {
  tokenName: '💊',
  chain: '🌐',
  price: '💰',
  fdv: '💎',
  liquidity: '💦',
  volume: '📊',
  change: '📉',
  topHolders: '👥',
  mint: '🖨️',
  socials: '🧰',
  chart: '💹',
  risk: '🛡️',
  // Social links
  bubblemap: '🫧',
  image: '🎨',
  telegram: '💬',
  website: '🌍',
  twitter: '🐦',
  refresh: '♺',
  // Tags
  verified: '✅',
  honeypot: '🚨',
  // Directions
  buys: '🅑',
  sells: 'Ⓢ',
};
```

## Full Formatting Example

```javascript
function formatTokenResponse(tokenData) {
  const {
    symbol, name, chain, dex,
    price, fdv, athFDV, athAge,
    liquidity, volume24h, age,
    change1h, volume1h, buys1h, sells1h,
    topHoldersPct, holderLinks,
    mintStatus, lpLockedPct,
    links, contractAddress, tags,
    riskStatus, riskConfidence
  } = tokenData;

  const mcapPct = ((fdv / athFDV) * 100).toFixed(1);
  const liqRatio = (volume24h / liquidity).toFixed(0);

  const lines = [];

  lines.push(
    `💊 ${name} [${formatLargeNum(fdv)}/${mcapPct}%] $${symbol}`
  );
  lines.push(
    `🌐 ${chain} @ ${dex}`
  );
  lines.push(
    `💰 USD: $${formatPrice(price)}`
  );
  lines.push(
    `💎 FDV: $${formatLargeNum(fdv)} ⇨ ATH: $${formatLargeNum(athFDV)} [${athAge}d]`
  );
  lines.push(
    `💦 Liq: $${formatLargeNum(liquidity)} [x${liqRatio}]`
  );
  lines.push(
    `📊 Vol: $${formatLargeNum(volume24h)} 🕰️ Age: ${age}`
  );
  lines.push(
    `📉 1H: ${change1h}% ⋅ $${formatLargeNum(volume1h)} 🅑 ${buys1h} Ⓢ ${sells1h}`
  );

  if (topHoldersPct !== undefined) {
    const holderLine = holderLinks
      ? `👥 TH: [${topHoldersPct}%](${holderLinks})`
      : `👥 TH: ${topHoldersPct}%`;
    lines.push(holderLine);
  }

  lines.push(
    `🖨️ Mint: ${mintStatus} ⋅ LP: ${lpLockedPct}%`
  );

  if (links) {
    const socialLine = formatSocialLinks(links);
    lines.push(`🧰 More: ${socialLine}`);
  }

  lines.push(`💹 Chart: DEX ⋅ DEF`);
  lines.push('');
  lines.push(`\`${contractAddress}\``);

  if (tags) lines.push(tags.join('⋅'));

  lines.push('');
  lines.push(
    `🛡️ Risk: ${riskStatus} @ ${formatLargeNum(riskConfidence)}x 👀 ${formatViews()}`
  );

  return lines.join('\n');
}
```

## Utility Functions

```javascript
function formatPrice(price) {
  const n = Number(price);
  if (n >= 1) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (n >= 0.001) return n.toFixed(6);
  if (n >= 0.000001) return n.toFixed(8);
  return n.toFixed(12);
}

function formatLargeNum(num) {
  const n = Number(num);
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(2);
}

function formatAge(timestamp) {
  const days = Math.floor((Date.now() - timestamp) / 86400000);
  if (days >= 30) return `${Math.floor(days / 30)}mo`;
  if (days >= 7) return `${Math.floor(days / 7)}w`;
  return `${days}d`;
}

function formatSocialLinks(links) {
  const iconMap = {
    website: '🌍',
    twitter: '🐦',
    telegram: '💬',
    bubblemap: '🫧',
    image: '🎨',
  };
  return Object.entries(links)
    .map(([key, url]) => `(${iconMap[key] || '🔗'})[${url}]`)
    .join(' ');
}
```

## Notes

- Contract addresses are rendered in backticks for copy-paste
- Tags (PRO, MAE, BAN, etc.) shown after address, separated by `⋅`
- Compact mode: use `/z`-style format (trimmed address)** (future feature)
- All percentages are shown with one decimal place