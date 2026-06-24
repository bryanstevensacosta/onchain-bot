# Commands on Telegram — Reference

> **Resumen (ES):** Referencia completa de todos los comandos `/slash` de Rick en Telegram. Agrupados por categoría: escaneos, búsqueda, charts, wallets, socials, AI, settings, etc. Fuente original: [talk.markets/t/commands-on-telegram/1465](https://talk.markets/t/commands-on-telegram/1465).

> All Telegram commands are **slash-commands** (`/command`).

---

## Basics — Token scans

| Command | Description |
|---|---|
| `/x` | Full token scan + detailed HP check. Default pricebot mode; see `/pricemode`. |
| `/pf` | Force pre-bond layout. |
| `/z` | Compact token scan with trimmed contract address. |
| `/c <token> [timeframe]` | Like `/x`, but with a chart. Example: `/c pepe 1m`. Default `5m`. Supports `5m/15m/1h/4h/1d/1w`. |
| `/cc <token> [timeframe]` | Request chart only. |
| `/cx <token> [timeframe]` | Like `/c`, but with limited token information. |
| `/gc <token>` | Like `/x` or `/z`, but shows group data instead. Use when `/groupmode` is off. |

---

## Basics — Token checks

| Command | Description |
|---|---|
| `/a <token>` | Query CoinGecko for token info. Example: `/a xmr`. |
| `/bm <token>` | Request a [BubbleMap](https://bubblemaps.io/). Supported: ETH, Base, SOL and more. Click the :bubbles: emoji on any scan for an interactive BubbleMap. |
| `/dp <token>` | Check if [DEX is paid](https://talk.markets/t/new-dex-paid-checker-v2/3529) for any token. |
| `/pc <ca>` | (ETH) Show similar contracts, sorted by last seen. |
| `/pre <ca>` | (ETH) Peep a token score if verified but not live yet. |

---

## Search & discovery — Token search

| Command | Description |
|---|---|
| `/ds <query>` | Search DEX tokens and return multiple results. |
| `/pfs <query>` | [Search pump.fun tokens](https://talk.markets/t/finding-the-oldest-pump-fun-tokens/4317). |
| `/old <ticker>` | Find oldest tokens sharing a ticker. |
| `/new <ticker>` | Find newest tokens sharing a ticker. |

---

## Search & discovery — Token research

| Command | Description |
|---|---|
| `/dev <token>` | Show [Deployer History](https://talk.markets/t/new-deployer-history/7779). |
| `/lore <token>` | Explain [what the lore is](https://talk.markets/t/whats-the-lore/7325). |
| `/web <url>` | [Find similar websites](https://talk.markets/t/webpage-similarity-scan-with-rick/2995). |
| `/meta`, `/metas` | Trending DexScreener metas/categories, sorted by 24h mcap change. |
| `/cto`, `/ctos` | Latest DexScreener community takeovers / CTO tokens. |
| `/pvp <token>` | Find similar/newer PVP tokens including age, FDV/ATH, 1H volume. |
| `/top <token> [period]` | Top traders for a token. Default `7d`; supports `1d/7d/30d/1y`. |
| `/best`, `/worst` | CoinGecko top gainers or losers. Default `24h`; supports `1h/24h/7d/14d/30d/60d/1y`. |

---

## Charts, heatmaps & market data

| Command | Description |
|---|---|
| `/index <chain> [page]` | Top 10 tokens by mcap. Example: `/index sol 2` gets 11-20. [More info](https://talk.markets/t/new-index-command-explained/2381). |
| `/macro` | Macro data snapshot (incl. OIL prices as of 2026). |
| `/hm`, `/hmap` | Generate a [heatmap](https://talk.markets/t/heatmaps-visualized-market-overview/6297). |
| `/hmc` | Category heatmap. |
| `/vol [limit] [1d/7d/30d]` | Launchpad / market volume stats. Default top 5 for `1d`. |
| `/bridge` | Links to popular crypto bridges. |
| `/pm <query>` | Search active Polymarket prediction markets. |
| `/s <ticker>` | Stock/commodity/trad-fi lookup. |
| `/v`, `/conv <value>` | Convert tokens. |
| `/n`, `/nft`, `/ns` | [Search NFTs with Rick](https://talk.markets/t/-/4947). |
| `/gas` | (ETH) Show gas info. |

---

## Wallets & holders

| Command | Description |
|---|---|
| `/nh <token>` | [Notable Holders](https://talk.markets/t/notable-holders-for-solana/3602). |
| `/h`, `/oh` | Known/top holders for a token. |
| `/w <wallet-label> [period]` | Wallet stats lookup. Default `7d`; supports `1d/7d/30d/1y`. |
| `/wl <label> [emoji]` | Reply to a wallet scan to save a wallet label. |
| `/wexport [wipe]` | Export this chat's saved wallet labels. `wipe` exports then clears (owner-only). |
| `/wimport` | Import wallet labels from pasted `wallet,label` lines or a replied `.txt/.csv` file. |

---

## Socials, Twitter/𝕏 & accounts

| Command | Description |
|---|---|
| `/moni <handle>` | Check a [Twitter/𝕏 profile with Moni Discover](https://discover.getmoni.io/?ref=HZMJHX). |
| `/twit <handle>` | Check if an X account [is recycled](https://talk.markets/t/twitter-recycle-checker/1286). |
| `/xd <username-url>` | Last 5 deleted tweets for an X/Twitter/𝕏 username. |
| `/soc <contract>` | [Find socials](https://talk.markets/t/social-finder/3445) for ETH or SOL contracts. |
| `/bsoc <contract>` | Find socials for Base contracts. |
| `/osoc <contract>` | Alternate socials lookup. |
| `/com`, `/comms` | Token community info ([CoinCommunities](./15-features-coincommunities.md)). |
| `/xprofile <on/off>` | Admin setting for automatic responses to X profile links in groups. |

> `/twit` is also shown on `/soc` — if there's X in the socials, the recycle scan is shown by default and indicated with the :recycle: emoji.

---

## Trending

View trending tokens on [Radar](https://app.rick.bot/radar).

| Command | Description |
|---|---|
| `/tt`, `/ttrending` | Trending tweets. |
| `/xt`, `/xtrending` | Trending Twitter/𝕏 accounts. |
| `/dt`, `/dextrending` | Trending DEX tokens. |
| `/pft`, `/pftrending` | Trending pump.fun tokens. |
| `/fmt` | Trending pre-bond FourMeme tokens. |

---

## Thesis & comments (Community Thesis)

| Command | Description |
|---|---|
| `/thesis` | View community thesis content. |
| `/comment` | Add or view thesis comments. |

See [16-community-thesis.md](./16-features-community-thesis.md).

---

## Group — Recent group scans

| Command | Description |
|---|---|
| `/last` | Last tokens scanned. |
| `/hot` | Popular tokens scanned. |
| `/groupburp` | Best [active plays](https://talk.markets/t/active-token-tracking-for-communities/1326) for the group. |
| `/groupgun` | Like `/groupburp`, but no micro caps. |
| `/groupme` | Your personal active plays. |
| `/runners`, `/today` | Runners report for tokens over 100K. Default `24h`; supports `24h/7d/30d`. |

> The above `groupburp/-gun/-me` commands can be filtered by chain.

---

## Group — Group leaderboards

| Command | Description |
|---|---|
| `/gp` | Members by [Group Points](https://talk.markets/t/group-points/6894). |
| `/ga`, `/groupath` | [ATH leaderboard](./13-features-ath-leaderboards.md) for tokens scanned/called in the group. |
| `/gap` | Group Points view for the group ATH leaderboard. |
| `/gam` | Minimal ATH leaderboard. |

---

## Group — Called tokens

[Conviction Call Tracking](https://talk.markets/t/conviction-call-tracking/8113)

| Command | Description |
|---|---|
| `/call [1-5]` | Reply to a Rick token scan to record a conviction call. |
| `/calls`, `/ca` | ATH/group leaderboard for tokens explicitly called with `/call`. |
| `/cam` | Compact called-token leaderboard. |

---

## Group — Clan rankings

| Command | Description |
|---|---|
| `/rank [league-rank]` | Group's Clan Rankings / XP rank. |
| `/wrapped` | Group/clan yearly Wrapped leaderboard. |

---

## Group — Flexcards

| Command | Description |
|---|---|
| `/flex`, `/pnl` | Generate a flex/PnL image card for a token's move from first seen to ATH/current. |
| `/fleximg` | Customize flex card image. |
| `/flexfont` | Customize flex card font. |

> **Groupmode is enabled by default.** More about `/groupmode` and `/gc` in [this post](https://talk.markets/t/ricklog-announcements/1074/48).

---

## Global leaderboards

Global leaderboard channel: [@BurpBoard](https://t.me/BurpBoard)

| Command | Description |
|---|---|
| `/watchlist` | Your last 10 checked tokens. |
| `/burp` | New tokens tracked in the last hour. |
| `/what` | Tokens checked in the last 1H, sorted by total view count. |
| `/idk` | Best tokens checked in the last 5m. |
| `/lasergun` | Last 10 tokens checked, sorted by 24H delta. |
| `/burpboard` | Link to the leaderboard channel. |

---

## Rick AI

AI listens to **Rick** (capital R) or @RickBurpBot mentions. Rick does not respond to replies of his own previous messages; however, you can reply to a message and mention the bot, and it will still know what you are replying to. Use `/rick` to ask questions about Rick.

AI commands take [credits](https://talk.markets/t/-/1136) from the group or your personal balance.

### Ask Rick

| Command | Description |
|---|---|
| `/rick <question>` | Ask a question about Rick features. |
| `/ask <question>` | Ask AI with web access. Example: `/ask When is the next FOMC?`. |
| `/deep <question>` | DeepSeek AI mode. |
| `/grok <question>` | Grok AI mode. |

### Reply tools

| Command | Description |
|---|---|
| `/translate`, `/tr` | [Translate](https://talk.markets/t/translate-any-message/3583) a quoted message. |
| `/eli5` | Reply to explain like I'm 5. |
| `/fact` | Reply to fact check. |
| `/define` | Reply to define term/topic. |
| `/explain` | Reply to explain. |
| `/counter` | Reply to generate counterargument. |
| `/vibes` | Reply to read the vibes. |
| `/simplify` | Reply to simplify. |
| `/rate` | Reply to rate 1–10. |
| `/jab` | Reply to generate a jab/roast. |

### Summaries

| Command | Description |
|---|---|
| `/dub` | [Chat summary](https://talk.markets/t/chat-summaries/3443). |
| `/dubs` | Silent chat summary with no pin. |
| `/dubx` | Experimental summary of recent messages. |
| `/tldr <url>` | Summarise anything: Twitter thread, YouTube, PDF, URL. |

### News

| Command | Description |
|---|---|
| `/now` | What's happening now? |
| `/news [timeframe] [query]` | Recent news. Default `24h`; capped at `30d`. |

### AI analysis

| Command | Description |
|---|---|
| `/ts <handle>` | [Twitter profile summary](https://talk.markets/t/tldr-anything/3441#p-12983-twitter-reports-3). |
| `/aica <contract> [chain]` | AI analysis of verified token, NFT or smart contract. Add `base` for Base. |
| `/aicapro <contract> [chain]` | Alias for `/aica`. |

### AI settings

| Command | Description |
|---|---|
| `/prompt` | Set [custom prompt](./12-features-custom-ai-prompt.md). |

---

## Utilities — Time tools

| Command | Description |
|---|---|
| `/epoch <timestamp>` | Convert Unix to human time. |
| `/tz [time-set-add-del] [timezone]` | Convert timezones or manage saved timezone shortcuts. |

---

## Utilities — Profile & IDs

| Command | Description |
|---|---|
| `/me` | Show your Rick skills/profile stats. |
| `/userid` | Show your user ID. |
| `/chatid` | Show current chat ID. |

---

## Utilities — Support & status

| Command | Description |
|---|---|
| `/start` | Start Rick / open onboarding. |
| `/commands` | Command cheatsheet. |
| `/help` | Link to Rick docs. |
| `/privacy` | Privacy info. |
| `/status` | Rick status. |
| `/wubba` | Basic ping check. |
| `/burpback <feedback>` | Send feedback/bug reports. Reply to include context. |

---

## Reminders

[Using reminders](https://talk.markets/t/-/3475)

| Command | Description |
|---|---|
| `/remindme <time> [comment]` | Personal reminder anywhere. Example: `/remindme 1h30m check chart`. |
| `/remind <time> [comment]` | Reminder for the chat. |
| `/listreminders` | Active reminders in current chat. |
| `/nevermind <reminder-id>` | Delete a reminder. |

> Reply to any message and type `/remind 1h` — Rick will link to that message in 1h.

---

## Pings (everyone) — Telegram

Alternative to `@everyone` bots.

| Command | Description |
|---|---|
| `/ping` (reply) | Ping a specific message. Group chats only. |
| `/ping` (no reply) | Alert the group fast. |
| `/ping <message>` | Repost and force-pin. Example: `/ping get rekt`. |

> Reminders and pings will push a force-pin (visible to muted members). Removing pin permissions disables it but is against the design intent.

---

## Credits & payments

| Command | Description |
|---|---|
| `/balance` | Show credit balance. Use in DM for personal balance. |
| `/mybalance` | Personal credit balance. |
| `/topup` | Top up / buy credits. |
| `/transfer <amount> <user>` | Transfer credits. |

---

## Fun, games & reputation

| Command | Description |
|---|---|
| `/img <prompt>` | Generate an image. |
| `/flip` | Flip a coin. |
| `/bank` | Show Burps bank (Blackjack). |
| `/bj`, `/blackjack` | Play blackjack. |
| `/rep` | Reputation stats. |
| `/disable_rep <on/off>` | Group admin toggle to disable reputation. |
| `+`, `++`, `-`, `--`, `long dash` | Reputation when replying to users. |

See [17-blackjack.md](./17-features-blackjack.md).

---

## Pushover alerts

[Pushover setup](https://talk.markets/t/pushover-alerts-how-to-setup/7962)

| Command | Description |
|---|---|
| `/push <message>` | Send a Pushover notification. |
| `/alert <message>` | Alert alias. |
| `/ptest` | Test Pushover notifications. |
| `/setpushgroup <group_key> <chat_id>` | DM-only group key setup. |
| `/setpushapp <app_token> <chat_id>` | DM-only app token setup. |

---

## Settings

> View current settings anytime with `/settings`. Toggle settings take `on` or `off` unless noted. Changes may take **up to 5 minutes** to apply.

### General

| Command | Description |
|---|---|
| `/settings` | Show current settings. |
| `/lang <code-off>` | Set tweet translation language for classic reposts, or off. |
| `/vx`, `/fixtwitter <on-classic-off>` | Configure [Twitter Reposts](./21-features-twitter-x.md). |
| `/stickergun <on-off>` | Auto-delete all stickers and GIFs in chat. |
| `/ricknews <on-off>` | Short news/updates in chat. |
| `/updateconfig <text-chart>` | Include or disable charts in `#UPDATE` alerts. |
| `/clantag <tag-OFF> CONFIRM` | Group admin setting for clan tag (max 5 alphanumeric chars). |
| `/setsocial <tweet-url-reset>` | Link X profile to clantag with proof tweet, or reset. |
| `/games <on-off>` | Enable/disable game commands. |
| `/mgalert <on-off>` | Migration alerts admin setting. |
| `/ctoalerts <on-off>` | CTO alerts admin setting. |
| `/tweetdels <on-off>` | Deleted-tweet alerts admin setting. Default `on`. |
| `/beta <on-off>` | Enable experimental features. |

### Pricebot

| Command | Description |
|---|---|
| `/tb` | Configure [Custom Trade Buttons](./14-features-trade-buttons.md). |
| `/buttons <on-off>` | Disable default button row (incl. refresh). Default `on`. |
| `/fsrefresh <on-off>` | Allow first scan refreshes. Default `on`. |
| `/autoimg` | Configure images/banners/charts on token scans. |
| `/ctheme [theme]` | Chart theme. Admin-only in groups; works in DM. |
| `/scanconfig <admin-reset-min_fdv>` | Group admin token scan restrictions. |
| `/rickfix <query> <replacement>` | Add a token query fix. |
| `/rickunfix <query>` | Remove a token query fix. |
| `/showfixes` | Show configured token query fixes. |
| `/groupmode <on-off>` | Show group data in footer. Default `on`. |
| `/anon <on-off>` | Off to show members in public leaderboards. |
| `/cashtag <on-off>` | Enable/disable $cashtag responder. |
| `/emojimode <on-off>` | Off to reduce emojis on pricebot. |
| `/autoresponder <on-off>` | Off to ignore contracts/links. |
| `/pricemode <sim-adv>` | Simple vs advanced responses. Default `adv`. |
| `/noresultmode <on-off>` | Respond if no token info? Default `on`. |

### AI

| Command | Description |
|---|---|
| `/prompt` | Set [custom prompt](./12-features-custom-ai-prompt.md). |
| `/balance` | Credit balance. |
| `/mybalance` | Personal credit balance. |
| `/topup` | Top up. |
