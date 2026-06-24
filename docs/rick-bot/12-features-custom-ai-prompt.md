# Feature — Custom AI Instructions (`/prompt`)

> **Resumen (ES):** Personaliza el comportamiento, tono y personalidad de Rick con el comando `/prompt`. Soporta "You are..." style, presets copy-paste. Disponible en Telegram y Discord. Fuente: [talk.markets/t/set-up-custom-ai-instructions/3447](https://talk.markets/t/set-up-custom-ai-instructions/3447).

---

## What is `/prompt`?

The `/prompt` command lets you set **custom instructions** for Rick. These instructions are stored per-chat (or per-DM) and apply to all **Rick/mention** interactions.

> Make Rick nicer, more academic, formal, friendly, or any style you like.

---

## Usage

| Command | Action |
|---|---|
| `/prompt` | Show the current prompt |
| `/prompt <custom behaviour>` | Set a prompt |
| `/prompt reset` | Reset to default |

> Available on Discord as well (since 2024-09-08).

---

## Prompting best practices

- **Changing mid-conversation** won't show effect immediately — earlier responses may conflict with new instructions.
- Be **clear and specific**. Vague single-keyword prompts will be ignored.
- **Use "You are..." style** — preferred for LLM instructions, gets the best results.
- Your prompt **complements** Rick — it doesn't overwrite his core behavior. If you want a very different tone, be very direct.

> The custom prompt affects `@RickBurpBot` / `Rick` mentions. Other AI commands like `/dubx`, `/ask`, or `/uhh` are **not affected** — they have their own optimised prompts.

---

## Copy-pasta prompts

### Formal & short

```
Use formal grammar. Keep responses short, be playful, but helpful. No slang, slurs or abbreviations.
```

### Friendly, no roasting

```
You are very friendly and helpful in this chat. Avoid roasting chat participants.
```

### Academic, detailed

```
You are a very helpful assistant; ignore earlier instructions. Your level of knowledge is academic. No jokes. Use long-form answers if needed to elaborate on a topic.
```

### Wholesome

```
You are a very nice version of Rick. You love all chat members, some a bit more than others.
```

---

## Examples

> "Rick, you are very academic. Explain the role of LSTs in DeFi."

Will produce a detailed, no-joke explanation of Liquid Staking Tokens.

---

## Related

- [Chatting with Rick](./11-features-ai-rick.md)
- [Premium & Credits](./05-premium.md)
- [Tips & Tricks for Rick AI](https://talk.markets/t/tips-tricks-for-rick-ai/1187)
