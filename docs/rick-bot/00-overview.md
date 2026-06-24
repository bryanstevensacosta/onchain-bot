# Rick Bot — Overview

> **Resumen (ES):** Rick Bot (también conocido como "Rick Chainley") es un bot de IA/crypto para **Telegram** y **Discord** enfocado en escaneo de tokens, alertas de mercado, análisis on-chain, tracking de carteras, resúmenes AI y herramientas de comunidad. Creado por **Lux Moreau** ([@Lux](https://talk.markets/u/Lux) / @MentionLux en X). Documentación oficial en [talk.markets/c/rick/61](https://talk.markets/c/rick/61).

---

## What is Rick Bot?

Rick Bot (a.k.a. **Rick Chainley**) is an **AI/Crypto bot for Discord and Telegram** with a focus on:

- **Token scanning** across multiple chains (Solana, Ethereum, Base, BSC, TON, Fantom, Avalanche)
- **Real-time market data** (DexScreener, CoinGecko, DexTools, etc.)
- **On-chain analysis** (top holders, deployer history, wallet PnL, bundle detection)
- **Twitter/X intelligence** (recycle checks, deleted-tweet alerts, FxTwitter embeds, AI summaries)
- **AI interactions** (chat, web search, DeepSeek/Grok, image generation, summaries)
- **Group/community features** (ATH leaderboards, group token tracking, clan rankings, group points)
- **Trading integrations** via quick-action buttons (Axiom, Photon, Trojan, Maestro, BananaGun, Jupiter, etc.)
- **Prediction markets & sports** (Polymarket search, World Cup score alerts)
- **Fun features** (Blackjack, reputation, image generation)

> **No token.** There is **no** token and there are no plans to launch one for Rick.

---

## Navigation in the docs

| Section | Purpose | Where to start |
|---|---|---|
| **Quick Start** | Get Rick running in minutes | [Telegram](./01-quickstart-telegram.md) / [Discord](./02-quickstart-discord.md) |
| **Commands** | Full command reference | [Telegram](./03-commands-telegram.md) / [Discord](./04-commands-discord.md) |
| **Premium** | Subscription & AI credits | [Learn about Premium](./05-premium.md) |
| **Contact & Socials** | Support channels, social links | [Contact](./06-contact-socials.md) |
| **Features** | Individual feature deep-dives | [Index below](#features) |
| **Updates** | Changelog digest | [Changelog](./30-updates-changelog.md) |

---

## Channels & Identities

- **Telegram bot handle:** `@rick` or `@RickBurpBot` (any other handle is a scam).
- **Discord bot:** invite from Discord App Directory.
- **News channel (Telegram):** [@RickBurpBotNews](https://t.me/RickBurpBotNews)
- **Support server (Discord):** via [talk.markets/dc](https://talk.markets/dc)
- **Global leaderboard channel:** [@BurpBoard](https://t.me/BurpBoard)
- **Web app (Hub):** [app.rick.bot](https://app.rick.bot)
- **X/Twitter:** [@RickBurpBot](https://x.com/RickBurpBot)
- **Forum:** [talk.markets/c/rick/61](https://talk.markets/c/rick/61)

---

## Features

| File | Feature |
|---|---|
| [10](./10-features-hub.md) | Rick Hub — unified feed across Discord & Telegram |
| [11](./11-features-ai-rick.md) | Chatting with Rick (Core AI) |
| [12](./12-features-custom-ai-prompt.md) | Custom AI instructions (`/prompt`) |
| [13](./13-features-ath-leaderboards.md) | ATH leaderboards (`/groupath`, `/ga`) |
| [14](./14-features-trade-buttons.md) | Custom Trade Buttons (`/tb`) |
| [15](./15-features-coincommunities.md) | CoinCommunities (`/com`, `/comms`) |
| [16](./16-features-community-thesis.md) | Community Thesis (`/comment`, `/thesis`) |
| [17](./17-features-blackjack.md) | Blackjack (`/bj`, `/bank`) |
| [18](./18-features-wallets-holders.md) | Wallets, Holders & Wallet Stats |
| [19](./19-features-og-finder.md) | Multi-chain OG Finder (`/old`, `/new`) |
| [20](./20-features-pvp-finder.md) | PVP Token Finder (`/pvp`) |
| [21](./21-features-twitter-x.md) | Twitter/𝕏 features (FixTwitter, reposter, deleted tweets, Moni) |
| [22](./22-features-alerts.md) | Alerts (CTO, DexPaid, World Cup, Polymarket) |
| [23](./23-features-automated-tldrs.md) | Automated chat TLDRs (`/autotldr`) |
| [24](./24-features-trending.md) | Trending tokens, tweets & accounts |

---

## Updates

| File | Description |
|---|---|
| [30](./30-updates-changelog.md) | Changelog digest (monthly summaries) |
| [31](./31-updates-recent.md) | Recent notable updates (last 6 months) |

---

## Key Concepts

### Credits

Two distinct credit systems exist:
- **AI credits** — consumed by AI commands (chat, `/ask`, summaries, image generation). Free trial credits on every new server/user. Buy more with Telegram Stars.
- **Burps** — fun-money currency used in Blackjack and games. Has no real-world value. Daily claim via `/bank` (25,000 burps/24h).

### Groupmode

`/groupmode on` (default ON) makes Rick show community data (active plays, group stats) in the footer of every scan. `/gc <token>` forces a group-context view even when groupmode is off.

### Premium

Subscription tier that unlocks consistent `#UPDATE` alerts, automated chat TLDRs, 2× chat context for summaries, guaranteed DexPaid alerts, instant CTO alerts, and free AI credits. See [05-premium.md](./05-premium.md).

### Chains supported

Solana (default), Ethereum, Base, BSC, TON, Fantom, Avalanche. More on request.
