# Feature — Multi-chain OG Finder (`/old`, `/new`)

> **Resumen (ES):** Encuentra los tokens más antiguos con un ticker dado, cross-chain. Útil para distinguir el token "original" de los copycats. Disponible en Telegram (Discord solo PVP). Fuente: [talk.markets/t/multi-chain-og-finder/8452](https://talk.markets/t/multi-chain-og-finder/8452).

---

## What is the OG Finder?

Find the **oldest tokens** sharing a ticker across chains, great for spotting the **original** vs copycats. This is a somewhat unfiltered variant of the [PVP Token Finder](./20-features-pvp-finder.md).

> Results are ranked by **token creation time**, where **oldest is on top**.

---

## Commands

| Command | Action |
|---|---|
| `/old <symbol>` | List oldest tokens matching that symbol/name |
| `/old <address>` | Resolves address → ticker → lists OGs sharing it |
| `/new` | Same as `/old`, but **newest creation on top** |

### Suffixes

You can chain these at the end of your query:

- `vol` — only show tokens with 24h volume ≥ $1000
- `<network>` — scope to one chain: `eth`, `sol`, `base`, `bsc`
- `fuzzy` — allow partial ticker matches (default **exact**)
- `mc` — sort output by FDV

> Example: `/old DOGE eth fuzzy vol`

---

## Notes

- Zero liquidity tokens are **never** shown.
- You can also **reply** to a message containing a token address and run `/old` — it picks up the CA automatically.
- Results show **token age**, **FDV**, **liquidity**, **1H vol**, **24H vol**, and the **launchpad** emoji (Pump, Bonk, etc.).
- Up to **10 results** per reply, oldest-first.
- Tap the **age** to open the token in Rick.

---

## Related

- [PVP Token Finder](./20-features-pvp-finder.md)
- [Commands on Telegram](./03-commands-telegram.md#search--discovery--token-search)
- [Introducing /old, find the OG](https://talk.markets/t/introducing-old-find-the-og/8453)
