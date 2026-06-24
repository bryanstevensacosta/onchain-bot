# Feature — Alerts (CTO, DexPaid, World Cup, Polymarket)

> **Resumen (ES):** Diferentes tipos de alertas automáticas: DexPaid (DEX pago), CTO (Community Takeover), marcadores deportivos (World Cup 2026), Polymarket (mercados de predicción). Cada una tiene su comando y requisitos (muchas requieren Premium). Fuentes originales enlazadas en cada sección.

---

## Table of contents

1. [DexPaid Alerts](#dexpaid-alerts)
2. [Instant CTO alerts](#instant-cto-alerts)
3. [World Cup & Polymarket](#world-cup--polymarket-odds)
4. [Polymarket general](#polymarket-general)
5. [Stock/commodity lookup](#stockcommodity-lookup)

---

## DexPaid Alerts

Get alerts in your group when [DEX is paid](https://talk.markets/t/new-dex-paid-checker-v2/3529). Use the **dp** command and your group will be notified when DEX is paid. [Source](https://talk.markets/t/dexpaid-alerts/3668).

> **Telegram:** only available for **premium** chats. Non-premium chats receive alerts occasionally; premium chats are **guaranteed**.
>
> **Discord:** available to **all servers for free**. Create the `@dexpaid` role; this role will be pinged.

### How to use

Use the **dp command** as explained in [Dex Paid Checker](https://talk.markets/t/new-dex-paid-checker-v2/3529):

- Telegram: `/dp <ca>`
- Discord: `.dp <ca>`

If DEX is **not paid** when you run the command, your group is automatically subscribed to alerts for that token. When Rick detects DEX is paid, the group receives an alert.

---

## Instant CTO alerts

[Premium](https://talk.markets/t/learn-about-rick-premium/1021) chats on **Telegram** receive **instant CTO alerts** by default. CTO information is sourced in realtime from [DexScreener](https://marketplace.dexscreener.com/product/token-community-takeover). [Source](https://talk.markets/t/instant-cto-alerts/8441).

Admins can opt out:

- `/cto` — list recent CTOs
- `/ctoalerts on/off` — toggle

### Notes

- Alerts show the **token age**; `/cto` output shows the timestamp the CTO was **claimed**.
- Alerts are pushed when the CTO is **processed successfully**.
- To avoid spam, max **2 pings per minute**.

---

## World Cup & Polymarket odds

Rick can post live **World Cup score alerts** in Telegram supergroups that opt in with `/sports`. [Source](https://talk.markets/t/world-cup-alerts-polymarket-odds/8577).

> Sports alerts are **off by default**. A group admin has to enable them first.

### Commands

| Command | Description |
|---|---|
| `/sports on` | Enable sports score alerts |
| `/sports off` | Disable |
| `/settings` | Check current group setting |

### Alerts fired

- Kickoff / match start
- Goals and score changes
- Half-time
- Full-time

### Notes

- Telegram **supergroups only**
- Admin-only setting
- Alerts may include score, odds, and a Polymarket button when Rick detected the market

---

## Polymarket general

### Commands

| Command | Description |
|---|---|
| `/pm <query>` | Search active Polymarket prediction markets |
| Share a Polymarket link | Rick posts details (auto-detect) |

---

## Stock/commodity lookup

Use `/s <ticker>` to query any stock, commodity, or other traditional financial instrument. (Added April 2026.) [Source](https://talk.markets/t/deleted-tweets-stock-lookup/8417).

> Available on Telegram. Includes real-time price info.

---

## Related

- [Premium](./05-premium.md)
- [Commands on Telegram](./03-commands-telegram.md#basics--token-checks) — `/dp`
- [Commands on Telegram — Settings](./03-commands-telegram.md#general) — `/ctoalerts`, `/mgalert`, `/tweetdels`
- [Dex Paid Checker](https://talk.markets/t/new-dex-paid-checker-v2/3529)
