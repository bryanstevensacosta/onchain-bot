# Feature — Community Thesis (`/comment`, `/thesis`)

> **Resumen (ES):** Comparte tu tesis sobre un token y deja que Rick genere un AI summary del conocimiento colectivo de todos los clans que opinaron. Requiere clantag + 5K clan XP. Beta. Fuente: [talk.markets/t/community-thesis-share-your-token-insights/8508](https://talk.markets/t/community-thesis-share-your-token-insights/8508).

---

## What is Community Thesis?

Drop your take on any token — Rick brews an **AI thesis** from the collective wisdom of every [clan](https://talk.markets/t/clans-for-telegram/2656) that weighed in. Comments are tied to your clan and feed into `/thesis` next time someone asks.

> Your clantag will be known in a **good** or **bad** way — be thoughtful as a clan.

If your group's Twitter/𝕏 profile is [linked to your clantag](https://talk.markets/t/clans-for-telegram/2656#p-10390-how-do-i-link-my-twitter-4), your clan will be hyperlinked whenever referenced.

> **Comments are unvetted. Always DYOR.** Spam, trolling, scams, random shilling and any -EV usage may result in a ban from **ALL** clan related features, including `/rank`.

---

## Commands

| Command | Action |
|---|---|
| `/comment <text>` (in reply to a token scan) | Log your take |
| `/thesis` (in reply to a scan) | Get the AI thesis summary |
| `/thesis <N>` (in reply) | Show the last N raw comments |
| `/thesis <address>` | Query directly without replying |
| `/thesis <address> <N>` | Pull last N raw comments by address |

> At least **5K Clan XP** is currently required to drop comments.

---

## Notes

- `/comment` requires a chat **clantag** set, **5K+ XP**, and is capped at **512 chars**.
- XP requirement may be lowered based on beta feedback.
- One `/comment` per chat every **5 minutes** — make it count.
- `/thesis <N>` is capped at **10** raw comments (sorted newest first).
- Comments show your **clantag**, **clan rank**, and **FDV at time of posting** (helps future readers gauge conviction).
- `/comment` posts auto-broadcast to a public thesis feed channel (SOON).
- Blocked at submit: any link that isn't `x.com`, `twitter.com`, or a known block explorer, plus `@handles`.

> **Tip:** prompt Rick to TLDR your group thesis: `Rick, TLDR our thesis about $TICKER in 2-3 short sentences, max 512 chars.`

---

## Examples

### Good (+EV) — Lore / Context

> "a 2014 frog edit, dormant for years. elon retweeted `https://x.com/elonmusk/status/...` took it from obscure to 50k followers overnight. original anon creator was identified and is now active on Twitter/𝕏, fees directed to him."

> "name is a wojak from 2017, anti-woke icon"

> "binance listing teased: `https://x.com/binance/status/...`"

> "dev previously launched $TICKER and didn't rug"

> "dev doxxed ex-google, LP burned, top 10 hold 18% mostly known whales. ticker is a 2021 wsb callback w cult following. broke ATH twice and holding above 1M. CZ liked the launch tweet `https://x.com/cz_binance/status/...` thinking 50M ceiling if narrative carries."

### Good (+EV) — Info / Insights

- "bundle looks very bad"
- "found socials: `https://x.com/...`"
- "LP is locked for 1 year"
- "comment from CLAN is not true: `https://x.com/...`"
- "dev is selling a lot: `https://solscan.io/...`"
- "dev is a known rugger, see $TICKER"
- "twitter looks hacked: `https://x.com/...`"
- "beta to $TOKEN at 24M, room to run"

### Bad (−EV) — examples

- "100x ez, just buy"
- "gm gm gm gm"
- "dev rugs" (no source — vs the +EV "dev is a known rugger, see $TICKER")
- 🚀🚀🚀🚀🚀
- "wen moon, wen lambo"
- "dm me for alpha"
- "follow my twitter `https://x.com/myhandle` for daily alpha"
- "bought my bag, please pump it"
- "lol you're all ngmi"

---

## Related

- [Commands on Telegram](./03-commands-telegram.md#thesis--comments-community-thesis)
- [Clan Rankings](https://talk.markets/t/clan-rankings/5134)
- [Clans for Telegram](https://talk.markets/t/clans-for-telegram/2656)
