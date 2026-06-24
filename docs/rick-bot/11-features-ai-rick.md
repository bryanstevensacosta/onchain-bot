# Feature — Chatting with Rick (Core AI)

> **Resumen (ES):** Interacción AI conversacional con Rick. Menciónalo con "Rick" (con R mayúscula) o @RickBurpBot. Cada interacción consume créditos. Soporta AI Vision, web search, context awareness, y herramientas de reply (ELI5, fact, define, etc.). Fuente: [talk.markets/t/chatting-with-rick/3854](https://talk.markets/t/chatting-with-rick/3854).

> This article is about **Core AI** — any AI interaction with Rick without using a command. Every Core interaction costs **one credit**.

---

## How to chat with Rick

To talk to Rick, simply **mention him**. Two ways:

1. Tag Rick (e.g. `@RickBurpBot`)
2. Use his name with a **capital R**: `Rick`

> In Telegram DMs, Rick responds to **any** message — no need to mention "Rick".

You can also **reply to any message** to emphasise its context — Rick will understand you are talking about that message.

---

## Core AI capabilities

- **Context awareness** — aware of the recent chat context
- **Talk.Markets search** — can search the official docs
- **Web browsing** — can browse most websites when needed
- He decides when to use these tools, but you can also ask him explicitly

See [Real-time AI](https://talk.markets/t/using-rick-ai-for-real-time-data/3448) for web-aware commands.

---

## Core commands

| Command | Description |
|---|---|
| `Rick <msg>` or `@RickBurpBot` | Chat with Rick |
| `/ask <prompt>` | AI with realtime web access |
| `/deep <prompt>` | DeepSeek AI mode |
| `/grok <prompt>` | Grok AI mode |
| `/dubs` | [Chat summary](https://talk.markets/t/chat-summaries/3443) |
| `/img <prompt>` | Generate image (costs 10 credits — premium only) |
| `/mybalance` | Check personal AI credits |
| `/balance` | Group/server balance |
| `/transfer <amount>` | Transfer credits to group/server |
| `/topup` | Buy credits with Telegram Stars |

> On Discord, commands are used with a `.` dot prefix instead (e.g. `.ask`, `.deep`).

---

## Convenience reply-tools (Telegram)

Quick one-shot wrappers for common tasks. **Reply to any message** (or paste content after the command) and Rick handles it. Each costs one credit (same as Core AI).

| Command | What it does |
|---|---|
| `/eli5` | Explain like I'm 5 |
| `/fact` | Fact-check the referenced claim |
| `/define` | Decode jargon, acronyms, technical terms |
| `/explain` | What it means and why it matters |
| `/counter` | Strongest counter-argument to the take |
| `/simplify` | Rewrite content in plain words |
| `/tldr` | TLDR anything |
| `/vibes` | Quick vibe check |
| `/rate` | Rate 1–10 with short reasoning |
| `/jab` | Roast/mock the author |

> Works best as a **reply** to the target message. Add inline steering: `/eli5 respond in bulletpoints`.

---

## AI Vision (Telegram only)

Reply to any image while mentioning "Rick" to enable AI vision. Useful for:

- Explaining images
- Image-to-text (TLDR or translate screenshots)
- Reading charts, memes, infographics

> Rick will **NEVER** see any images unless you reply to them directly. Images are **not stored** and are used solely for the current AI vision prompt.

You can instruct Rick in the same message as your image reply. Only **Core AI** supports vision — other commands don't.

---

## Can I disable AI features?

**No.** Read the [in-depth explanation](https://talk.markets/t/can-i-turn-off-the-ai/1993) to understand why.

---

## Disclaimer

> Rick AI may sometimes provide incorrect or misleading information. **Always verify output independently.** Rick's responses are **not financial advice** — do your own research.

---

## Related

- [Custom AI instructions (`/prompt`)](./12-features-custom-ai-prompt.md)
- [Premium & AI Credits](./05-premium.md)
- [Commands on Telegram](./03-commands-telegram.md#rick-ai)
- [Commands on Discord](./04-commands-discord.md#ai-commands)
- [Chat Summaries](https://talk.markets/t/chat-summaries/3443)
