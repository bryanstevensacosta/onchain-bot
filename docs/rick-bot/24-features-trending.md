# Feature — Trending (Tokens, Tweets, Accounts, More)

> **Resumen (ES):** Comandos para ver lo que está trending en diferentes fuentes: tweets, cuentas de X, tokens DEX, tokens pump.fun, tokens FourMeme pre-bond. Disponible en Telegram y Discord. Fuente: [talk.markets/t/rick-trending/3717](https://talk.markets/t/rick-trending/3717) (y actualizaciones posteriores).

> View trending tokens on [Radar](https://app.rick.bot/radar) — part of Rick Hub.

---

## Trending commands

| Command | Description |
|---|---|
| `/tt`, `/ttrending` | Trending tweets |
| `/xt`, `/xtrending` | Trending Twitter/𝕏 accounts |
| `/dt`, `/dextrending` | Trending DEX tokens |
| `/pft`, `/pftrending` | Trending pump.fun tokens |
| `/fmt` | Trending pre-bond **FourMeme** tokens |

---

## Other discovery commands

| Command | Description |
|---|---|
| `/index <chain> [page]` | Top 10 tokens by mcap (with paging). Example: `/index sol 2` for 11–20 |
| `/meta`, `/metas` | Trending DexScreener metas/categories (24h mcap change) |
| `/cto`, `/ctos` | Latest DexScreener community takeovers |
| `/best`, `/worst` | CoinGecko top gainers or losers (default `24h`; supports `1h/24h/7d/14d/30d/60d/1y`) |
| `/pfs <query>` | Search pump.fun tokens |
| `/ds <query>` | Search DEX tokens |
| `/hm`, `/hmap` | Generate a market heatmap |
| `/hmc` | Category heatmap |
| `/vol [limit] [1d/7d/30d]` | Launchpad / market volume stats (default top 5, `1d`) |

---

## Related

- [Commands on Telegram — Trending](./03-commands-telegram.md#trending)
- [Commands on Telegram — Charts, heatmaps & market data](./03-commands-telegram.md#charts-heatmaps--market-data)
- [Rick Hub](./10-features-hub.md)
