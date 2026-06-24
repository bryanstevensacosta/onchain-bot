# Feature — Twitter/𝕏 Integration

> **Resumen (ES):** Suite de features de Twitter/𝕏: previews mejorados (FixTwitter), nuevo reposter minimalista, alertas de tweets borrados, recycled handles checker, Moni Discover, y traducciones. Fuente original: [Better Twitter/𝕏 previews](https://talk.markets/t/better-twitter-previews/1849) · [New 𝕏 reposter](https://talk.markets/t/new-reposter/8123) · [Deleted Tweets & Stock Lookup](https://talk.markets/t/deleted-tweets-stock-lookup/8417) · [Query Deleted Tweets + Alerts](https://talk.markets/t/query-deleted-tweets-alerts/8511).

---

## Table of contents

1. [FixTwitter — Better 𝕏 previews](#fixtwitter--better-x-previews)
2. [New 𝕏 reposter (BETA)](#new-x-reposter-beta)
3. [Deleted tweets — alerts & lookup](#deleted-tweets--alerts--lookup)
4. [Recycle checks & profile tools](#recycle-checks--profile-tools)
5. [Translations](#translations-telegram)

---

## FixTwitter — Better 𝕏 previews

Fix Twitter/𝕏 embeds with the **`/fixtwitter`** feature. It fixes broken embeds, **detects contracts**, and ensures smooth media playback without leaving your app. With "instant view" support (even for deleted tweets), the experience is seamless.

Plus, enjoy emoji shortcuts for [username history](https://talk.markets/t/twitter-recycle-checker/1286), [AI summaries](https://talk.markets/t/tldr-articles-threads-and-youtube-videos/3441), and profile insights.

> Available on **Discord** and **Telegram**.

> **The new reposter is now default** — [learn about the benefits](#new-x-reposter-beta). Prefer classic FxTwitter? Run `/vx classic` in your group.

### Key benefits

- Detect contracts in tweets
- **Fix missing previews** in Telegram or Discord
- Minimal **clutter** in your chat
- Play media without leaving Telegram
- 99% chance of embedded preview
- Supports "instant view" (even for deleted tweets)
- Emoji shortcuts: TLDR; recycles & more info
- Make 𝕏 posts **stand out** from regular messages

### Usage

| Command | Action |
|---|---|
| `/fixtwitter on` (default) | Rick deletes 𝕏 links and reposts as FxTwitter embeds |
| `/fixtwitter off` | Disable |
| `/vx` (Telegram only) | Alternative to `/fixtwitter` |

> **Required permission:** delete messages. Instagram & TikTok links are also supported.
>
> **Telegram:** default embed shows at bottom (bot). Use `/vx top` to move to top.

### Emoji tools on Rick reposts

| Emoji | Action |
|---|---|
| :recycle: | Check [username history](https://t.me/RickBurpBot?start=twit-MentionLux) |
| :sparkles: | Request [AI summary](https://t.me/RickBurpBot?start=ts-MentionLux) |
| :information_source: | [Twitter/𝕏 Profile Insights](https://talk.markets/t/twitter-profile-insights/2821) |

---

## New 𝕏 reposter (BETA)

Due to ongoing issues with Telegram's preview fetching, Rick rolled out an **experimental 𝕏 reposter** to address the problem. The classic FxTwitter reposter remains supported.

### Benefits vs classic

- Clean, minimal responses
- Expands threads & articles
- Clear quote/reply hierarchy
- Instantly get a grasp of the context
- Better AI context when referenced
- Works with `/tr` to any language and core AI interactions
- Extended display of [deleted tweets](#deleted-tweets--alerts--lookup)

### Settings

| Command | Action |
|---|---|
| `/vx bot` (default) | Position top author at the bottom |
| `/vx top` | Move top author to the top |
| `/vx classic` | Use classic FxTwitter reposter |

---

## Deleted tweets — alerts & lookup

Rick tracks shared X posts and warns the group when one looks **deleted**. You can also pull up the latest deleted posts from any X account Rick has seen.

### Commands

| Command | Description |
|---|---|
| `/xd <username>` | Last 5 deleted tweets for an X account |
| `/tweetdels on/off` | Toggle deletion alerts |

### Notes

- Alerts only fire in **supergroups** and only if the original share is **less than 7 days old**
- Alerts may be **false positives** — confirm on X before acting
- `/xd` only shows tweets Rick already observed (not a full X archive)
- Rick auto-detects a **contract address** in the deleted tweet text when present
- Every X repost (non-classic mode) includes a :wastebasket: deeplink to the same deleted-tweet history

---

## Recycle checks & profile tools

### `/twit <handle>`

Check if an X account [is recycled](https://talk.markets/t/twitter-recycle-checker/1286). Surfaces prior username history.

### `/moni <handle>`

Scan a Twitter/𝕏 account with [Moni Discover](https://discover.getmoni.io/?ref=HZMJHX) — a separate profile-scoring product.

### `/ts <handle>`

Generate a [Twitter profile summary](https://talk.markets/t/tldr-anything/3441#p-12983-twitter-reports-3) — recent tweets + AI analysis.

---

## Translations (Telegram)

Use `/lang <code>` to translate tweets, only works with **classic** mode. Using the new reposter? Just reply with **`/tr`** to the tweet.

| Code | Language |
|---|---|
| `off` | No translation (default) |
| `en` | English |
| `ar` | Arabic |
| `de` | German |
| `es` | Spanish |
| `fr` | French |
| `hi` | Hindi |
| `id` | Indonesian |
| `it` | Italian |
| `ja` | Japanese |
| `nl` | Dutch |
| `pl` | Polish |
| `pt` | Portuguese |
| `ru` | Russian |
| `th` | Thai |
| `tr` | Turkish |
| `vi` | Vietnamese |
| `zh-cn` | Simplified Chinese |
| `zh-tw` | Traditional Chinese |

---

## FAQ

### Open FixTwitter/𝕏 links in X app

By default, most apps open links in "In-App Safari", forcing you to stay in the app. [Learn how to fix this](https://talk.markets/t/open-fixtwitter-links-in-twitter-app/5042/1).

### FixTwitter is enabled, but Rick is not reposting shared posts

Ensure Rick can **delete messages**. Without this permission, Rick will not repost social links.

---

## Related

- [Commands on Telegram](./03-commands-telegram.md#socials-twitter-x--accounts)
- [Commands on Discord](./04-commands-discord.md#crypto-commands)
- [Settings — General (`/vx`, `/fixtwitter`, `/lang`)](./03-commands-telegram.md#general)
