# Feature — PVP Token Finder (`/pvp`)

> **Resumen (ES):** Encuentra matches PVP de un token (tickers similares con datos de FDV/ATH/volumen 1H). Multi-chain. Auto-funciona en tokens <24h. Disponible en Telegram y Discord. Fuente: [talk.markets/t/pvp-token-finder/8152](https://talk.markets/t/pvp-token-finder/8152).

---

## What is the PVP Finder?

**PVP Finder** shows `$TICKER` matches that fit various criteria. The goal is to quickly see **relevant** tokens of interest.

> As of April 2026, PVP is **multi-chain** — usage is multi-chain, while auto-show on fresh scans stays scoped to the token's own chain.

---

## Usage

PVP matches are **automatically shown** on tokens **younger than 24h**.

> To see PVPs for **older** tokens, use `/pvp <symbol or address>` or simply `/pvp` **in reply to** a token scan.

| Command | Effect |
|---|---|
| `/pvp` (as command) | All supported chains |
| `/pvp` (on fresh scan) | Same chain as the scanned token |
| `/pvp <symbol or address>` | Force for any token |

> Discord: `.pvp symbol`

---

## Line definitions

Results are sorted by **FDV**. Click **the age** for token info. Launchpad emoji shown if available.

**Format:**

> :crossed_swords: **PVP matches**
> ↳ `AGE` ⋅ `FDV` ⇨ `ATH` ⋅ 1H: `VOL`
> ↳ **20m** ⋅ `25K` ⇨ `52K` ⋅ 1H: `192K`

> There may be more ticker matches — Rick only shows results that are **relevant enough** to display.

---

## Feedback

Use `/burpback <feedback>` in reply to a token scan to give feedback (missing tokens, tokens that shouldn't be there, etc.).

---

## Related

- [Multi-chain OG Finder (`/old`)](./19-features-og-finder.md)
- [Commands on Telegram](./03-commands-telegram.md#search--discovery--token-research)
- [Commands on Discord](./04-commands-discord.md#crypto-commands)
- [Introducing /old, find the OG](https://talk.markets/t/introducing-old-find-the-og/8453)
