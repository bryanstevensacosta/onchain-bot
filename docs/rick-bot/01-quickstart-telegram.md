# Quick Start — Rick on Telegram

> **Resumen (ES):** Guía express para empezar a usar Rick Bot en Telegram: añadir el bot, comandos esenciales, tips y advertencias anti-scam. Fuente original: [talk.markets/t/quick-start-rick-on-telegram/3082](https://talk.markets/t/quick-start-rick-on-telegram/3082).

---

## Get Rick

- **Bot handle:** `@rick` or `@RickBurpBot` — **no other handle is legitimate** (scam ads are common on Telegram).
- Add the bot to a group **and promote it to admin** for full functionality.
- Telegram chat must be a **supergroup** for token tracking features (ATH leaderboards, groupburp, etc.) to work.

---

## New here?

Start with the full setup guide: [Setting up Rick on Telegram](https://talk.markets/t/setting-up-rick-on-telegram/1107) ([Quick Start](https://talk.markets/t/quick-start-rick-on-telegram/3082)).

---

## Hot commands

The most-used `/slash` commands on Telegram:

| Command | Purpose |
|---|---|
| `/x <token-or-ca>` | Full token scan + detailed HP check (default pricebot mode) |
| `/z <token>` | Compact token scan with trimmed contract address |
| `/c <token> [timeframe]` | Like `/x` but with chart. Default `5m`. Supports `1m / 5m / 15m / 1h / 4h / 1d` |
| `/cc <token> [tf]` | Chart only |
| `/ga` / `/groupath` | Group ATH leaderboard (top tokens by gain) |
| `/tldr <url>` | TLDR anything (tweet thread, YouTube, PDF, URL) |
| `/twit <handle>` | Check if an X account is recycled |
| `/remindme <time> <note>` | Personal reminder (DM delivery) |
| `/web <url>` | Find similar websites |
| `/dubs` / `/dubx` | Chat summary |
| `/dp <ca>` | Check if DEX is paid for any token |
| `/index` | Top 10 coins by mcap (with more detail) |
| `/groupburp` | Community watchlist (active plays) |

View all commands in [03-commands-telegram.md](./03-commands-telegram.md).

---

## Pro tips

- **Lower your font size on mobile** — Rick looks much better with smaller text.
- Use **`/rick <question>`** to ask Rick's AI about his own features.
- **`/prompt`** lets you set a custom prompt to change Rick's tone (formal, friendly, academic, etc.).
- **Personalize `/flex` cards** with custom fonts/images.
- **Reply with `x`** to instantly delete a Rick response in your chat.
- **Append `2`** to a query for the second-best result (e.g. `/x token 2`).
- **Capital "R"** is required: Rick only responds to "Rick" (capital R) or @RickBurpBot mentions.
- **Follow the markets:** join [@BurpBoard](https://t.me/BurpBoard).

---

## Scam warning

> **Do not fall for malicious ads on Rick.** Rick goes by `@rick` or `@RickBurpBot`. **Any other handle is a scam.**

Examples of scam ads pretend to be Rick and try to steal funds or credentials.

---

## Fresh from the lab (notable features)

- `Community Thesis`: share your token insights → [16-community-thesis.md](./16-features-community-thesis.md)
- `New Twitter Reposter` (𝕏) → [21-twitter-x.md](./21-features-twitter-x.md)
- `Skills` system
- `Known (Top) Holders & Bundles` → [18-wallets-holders.md](./18-features-wallets-holders.md)
- `Group Wallet Labels`
- `Token Deployer History`
- `Custom Trade Buttons` (`/tb`) → [14-trade-buttons.md](./14-features-trade-buttons.md)
- `Reputation` system
- `Group Points` (`/gp`)
- `TZ Converter` (`/tz`)
- `Manage Inactive Members`
- `Auto-charts on scans`
- `Style your charts` (`/ctheme`)
- `Token Favorites` (`/f`)

> Changes to `/settings` are effective within **5 minutes**.

---

## Get help

- Type `/help` for a link to the docs.
- Use `/burpback <feedback>` to send feedback (optionally reply-to a message to include context).
- Join the [support server](https://talk.markets/dc) on Discord or [@RickBurpBotNews](https://t.me/RickBurpBotNews) on Telegram.
