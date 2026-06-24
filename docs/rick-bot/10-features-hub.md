# Feature — Rick Hub

> **Resumen (ES):** Rick Hub es una app web y mini-app de Telegram que unifica el feed de scans de todos tus grupos de Discord y Telegram en una sola vista. Soporta búsqueda histórica, leaderboards en tiempo real, notificaciones push y estadísticas únicas por grupo. Fuente: [talk.markets/t/rick-hub-your-feed-your-edge/8255](https://talk.markets/t/rick-hub-your-feed-your-edge/8255).

---

## What is Rick Hub?

**Rick Hub** is an aggregated, real-time feed of every token scan from your **Telegram** and **Discord** groups. It works as:

- A **web app** at [app.rick.bot](https://app.rick.bot)
- A **Telegram Mini App** via [@rick](https://t.me/rick/hub?mode=compact)

> **Status:** BETA — issues/suggestions via [Contact](./06-contact-socials.md).

---

## Highlights

- **Unified Feed** — never miss a scan across platforms
- **Advanced tracking** — not just first scans
- **Historical search** across all your groups
- **Real-time leaderboards**
- **Unique & insightful stats**

---

## Getting started

**Join the Hub:** [app.rick.bot](https://app.rick.bot)

> The invite may land in your **spam inbox**. Search inbox for `noreply@rick.bot`. With Gmail, try the "all mail" inbox.

### Linking your Telegram/Discord

Linking works like "Sign in with Google" or "Login with X":

- ✅ User ID & basic profile (name, username, avatar)
- ❌ Private messages / DMs
- ❌ Ability to post or act on your behalf

To use the feed, link your Telegram and/or Discord account on the [profile settings](http://app.rick.bot/profile) page.

> Tap **"open"** on `@rick` to use the **Mini App** inside Telegram. Linking via the Mini App is seamless and **does not need** additional auth.

---

## Notifications

- **In-app** notifications and sounds are enabled by default.
- **Background push** notifications can be enabled for **6 hours** on the [profile](http://app.rick.bot/profile) page.
- Notifications are only sent when the app is in the background.

> **Using Brave?** Navigate to `brave://settings` and enable `Use Google services for push messaging`.

---

## Scan data

The Hub operates **separately** from your `/ga` data. This separation enables all the app's features. When stable, Rick may consider migrating group data to the app. For now, some GA data may differ from the app.

---

## Important notes

- Rick does **NOT** know when members **leave** a group.
- After being active in a server/group, you have **feed access for 24 hours**.

---

## FAQ

**I use another scan bot, can Rick stay silent?**
Yes. Use `/autoresponder off` on Telegram or `/pricemode` on Discord — when disabled, Rick still tracks scans in the background.

**The ATH is wrong, token X hit ... FDV**
Just like Rick's [ATH leaderboards](./13-features-ath-leaderboards.md), Rick aims for realistic ATHs rather than short-lived spikes (pump and dumps).

---

## TOS / Privacy

By signing up and using the Hub, you agree with the [Terms of Service](https://talk.markets/t/terms-of-service-for-rick-chainley/3764) and [Privacy Policy](https://talk.markets/t/privacy-policy-for-rick-chainley/2904).

---

## Related

- [Quick Start Telegram](./01-quickstart-telegram.md)
- [Quick Start Discord](./02-quickstart-discord.md)
- [Premium](./05-premium.md)
- [Contact & Socials](./06-contact-socials.md)
