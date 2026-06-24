# Feature — ATH Leaderboards

> **Resumen (ES):** Leaderboards All-Time-High por comunidad. Muestra tokens ordenados por ganancia hasta su ATH, con timeframes configurables, filtros por chain y métricas por usuario (avg gain, total tokens, hit rate). Fuente: [talk.markets/t/ath-leaderboards/3111](https://talk.markets/t/ath-leaderboards/3111).

---

## What are ATH leaderboards?

All-Time-High leaderboards show tokens **by gains to ATH** in your community, with customisable timeframes and network options.

> Telegram chat must be a **supergroup** for token tracking to work. [Read more](https://talk.markets/t/active-token-tracking-for-communities/1326#p-6557-how-does-it-work-1).

---

## Quick usage

Most parameters can be combined in any way or order.

> Additionally, `/ga` can be used as shorter command. Use `/gam` for a more compact response.

| Command | Effect |
|---|---|
| `groupath` | Default: top 50 newest tokens |
| `groupath 1h` | Last 1h |
| `groupath sol all` | All-time best of Solana |
| `groupath 6h last` | Includes old tokens |
| `groupath fresh 4h` | Sorted by recently hit ATH |
| `groupath @user last` | Last 50 for another member, include old tokens |
| `groupath me sol` | Only your own, only SOL |
| `groupath 7d ago` | Previous 7 days |
| `groupath min 100k` | Set min. start FDV to include |

**Discord:** select the `/groupath` command from the command list; fill parameters via the helper.

---

## Arguments

The command has many arguments but can be called without any.

By default you see the **top tokens by gain**, based on the **last 50 NEW tokens** that **were seen** (and meet the requirements) in your community.

### Timeframe

Any amount of hours, days, or weeks:

- `1h`, `4h`, `1w`, `2w`, `3m`, or any custom value
- `all` includes the best tokens in your chat

> Specifying a timeframe includes only **NEW** tokens within it. Higher timeframes may show fewer tokens due to dynamic quality filters.
> Add `last` parameter to include **any token** scanned within the timeframe (including older tokens).

### Personal

Include `me` to show only tokens you got the **first scan** for.

### Networks

Any of: `sol`, `eth`, `base`, `bsc`, `ton`, `ftm`, `avax` — more on request.

### Fresh

Sort by **ATH time** — surfaces tokens that hit ATH recently.

---

## Stats explained

For top 5 users, Rick shows: **username**, **average gain**, **total tokens**, **hit rate**, **rating**.

**Example line:**

> `Name` ⋅ avg: `average gain` ⋅ T: `total tokens` ⋅ :bullseye: `hit rate` ⋅ `rating`

> :1st_place_medal: `TICKER` @ `FDV seen` ➜ `ATH fdv` Δ `X's to ATH`
> ⤷ `[chain]` ⏶ `time since ATH` ↦ `username` :flexed_biceps:

### What is hitrate?

Currently, a hit is counted if the token did at least **5x**.

### What is median?

The **median** is the middle value in a list of numbers when sorted. It helps give a more accurate representation of performance by reducing the impact of extreme values (outliers).

---

## FAQ

### Some tokens are missing!

Rick only shows tokens that have a timestamp for the ATH (stored for the past 5–6 months).

**Pump.fun** :pill: tokens are included **after migration** — required for the leaderboard.

Several filters exclude quick pump-and-dumps, known honeypots, and scams. Other filters ensure quality output, fine-tuned as market conditions change.

---

## Related

- [Quick Start Telegram](./01-quickstart-telegram.md) | [Discord](./02-quickstart-discord.md)
- [Commands on Telegram](./03-commands-telegram.md#group--group-leaderboards)
- [Commands on Discord](./04-commands-discord.md#server-related-token-tracking)
- [Active Token Tracking (`/groupburp`)](https://talk.markets/t/active-token-tracking-for-communities/1326)
- [Leaderboard FAQ](https://talk.markets/t/leaderboard-faq/3034)
