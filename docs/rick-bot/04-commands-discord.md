# Commands on Discord — Reference

> **Resumen (ES):** Referencia completa de comandos de Rick en Discord. Muchos usan prefijo `.` (dot commands); los demás son slash-commands. Fuente original: [talk.markets/t/commands-on-discord/1099](https://talk.markets/t/commands-on-discord/1099).

> Post any chart link or contract to request token stats. For fastest shortcuts, see [this article](https://talk.markets/t/setup-discord-for-ricks-shortcuts-to-work-properly-and-fast/1065).

---

## Rick AI

Rick listens to "**Rick**" or mentions, with rate-limits and anti-spam rules.

> Jump to [AI commands](#ai-commands).

---

## Crypto commands

| Command | Description |
|---|---|
| `.z shib weth` | Short token info (trimmed contract, limited security) |
| `.x <0x..>` | Token info (full contract, enhanced security; **default**) |
| `.c pepe 5m` | Include a chart. Default `5m`, supports `1m/15m/1h/4h/1d` |
| `.cc pepe 5m` | TBA |
| `.bm 0x..` | Include [BubbleMaps](https://bubblemaps.io/) for a token |
| `.soc 0x..` | Find socials for SOL or ETH contracts |
| `.dp 0x..` | Check if DEX is paid for SOL tokens |
| `.nh ca` | [Notable holders for SOL](https://talk.markets/t/notable-holders-for-solana/3602) |
| `.twit handle` | Check [Twitter user history](https://talk.markets/t/twitter-recycle-checker/1286) |
| `.bsoc 0x..` | Check Base contract for socials |
| `.a <name-ticker>` | Query CoinGecko for token info |
| `.pf <contract>` | Force-search a pump.fun token |
| `pftrending` | Trending pump.fun tokens |
| `sptrending` | Trending sunpump tokens |
| `dextrending` | Trending DEX tokens |
| `index` | Top 10 by mcap |
| `vol` | Show Market Volume |
| `.moni <handle>` | Scan an X account with [Moni Discover](https://discover.getmoni.io/?ref=HZMJHX) |
| `rickfix` | Create token filter: `/rickfix abc 0x123..` |
| `rickunfix` | Delete token filter: `/rickunfix abc` |
| `showfixes` | List all current filters |

> If a token query does not return the right token, anyone can add a filter: `/rickfix <token query> <pair address>`.

---

## Token tracking

| Command | Description |
|---|---|
| `burp` | Tokens tracked in the last 1H |
| `idk` | Tokens checked in the last 1H |
| `beer` | 1H performance of checks in the last hour |
| `lasergun` | Most recent tokens checked by 24H% |
| `what` | Tokens checked in the last 1H, sorted by total view count |
| `watchlist` | Your last 10 checked tokens |

---

## Server-related token tracking

| Command | Description |
|---|---|
| `groupath` | [ATH leaderboard](./13-features-ath-leaderboards.md) |
| `groupburp` | Current [server leaderboard](https://talk.markets/t/active-token-tracking-for-communities/1326) |
| `watchlist` | Your last 10 checked tokens |
| `.gc` | Like `.x` or `.z`, but shows group data in footer |
| `groupmode` | on/off (default **ON**) — server data in footer |

---

## AI commands

These commands can be used by everyone but **cost credits** — see [Credits for Rick](https://talk.markets/t/1136). Every new server/user gets free trial credits.

| Command | Description |
|---|---|
| `.ask <prompt>` | Ask agent that can browse the web |
| `.deep <prompt>` | General knowledge with DeepSeek |
| `.aica <ca>` | AI Analysis of any ETH contract |
| `.dx` | Improved channel summary (**BETA**) |
| `.d` | Summarise recent channel messages |
| `.dv` | Summary for channels where a webhook posts as different authors (TweetShift) |
| `.dd` | Detailed summary of last 15 messages |
| `.s <url>` | Simple summary (TLDR)* |
| `.sd <url>` | Detailed summary* |
| `.e5 <url>` | Explain like I'm five (ELI5)* |
| `.u <tweet url>` | Unroll a thread |
| `.vid <url>` | Summarise a YouTube video |
| `.ts username` | Twitter/𝕏 report + Recent tweets |

\* Supports Twitter/𝕏 / Medium / Substack / Various blogs & many more.

---

## Scoring on ETH tokens

[Scoring](https://talk.markets/t/scoring-rick-sanchez/1153)

| Command | Description |
|---|---|
| `.pc <ca>` | Show similar contracts, sorted by last seen |
| `.pre <ca>` | Peep a token score (if verified but not live yet) |

---

## General

| Command | Description |
|---|---|
| `.epoch <1682996967>` | Convert Unix to local timestamp |
| `remind` | Create reminder in current channel |
| `listreminders` | Show active reminders + IDs in current channel |
| `nevermind <ID>` | Delete a reminder |
| `gm` & `gn` | Good morning & Good night |

> Reminders ping **you** by default; an optional value lets you set `@here` or `@everyone`.

---

## Settings (admin)

| Command | Description |
|---|---|
| `anonmode` | Hide/show members on [leaderboards](https://talk.markets/t/leaderboards-burpboard/1466) |
| `noresultmode` | Turn on/off quicklinks if no live pair is found |
| `pricemode` | Change or disable pricewidget responses |
| `fixtwitter` | Should Rick rewrite twitter links to vxtwitter? |
| `cashtags` | Should Rick respond to $cashtags? |
| `beta` | Opt in to experimental features |

---

## Other

| Command | Description |
|---|---|
| `balance` | Show server credit balance |
| `mybalance` | Check personal credit balance |
| `rep` | Show ranking leaderboard |
| `guildrep` | Show server leaderboard |
| `.rep` | Show your rank |
| `.wubba` & `zap` | Check response time (ping) |
| `.vip` | Information about credits |
| `.help` | Link to docs |
