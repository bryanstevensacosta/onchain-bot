# KOL 2397610468 — formato analizado

- Tipo: Channel
- Title: KOLscope
- Username: @KOLscope
- Resolved as: -1002397610468
- Mensajes muestreados: 50
- Mensajes con URLs: 50 (100%)
- Mensajes con media: 50 (100%)
- URLs extraídas por fuente:
  - entity_text_url: 249
- Longitud media: 159 chars

## Ejemplo anonimizado

```
STATUS UNLOCKED: Gold Mine 🪙

Mining profits.

@BullishCallsPremium made 6 back-to-back 2x calls!

🟪 View❕🟪 View
🟪 View❕🟪 View
🟪 View❕🟪 View

💍 KOL

🆖 Advertise across KOLscope Today 🔥
```

## Regex base recomendado

```js
// MarkdownV1: (texto)[url]
const RE_MD_V1 = /\(([^()]+?)\)\[([^\]\s]+?)\]/g;

// MarkdownV2: [texto](url)
const RE_MD_V2 = /\[([^\]\n]+?)\]\(([^\s)]+?)\)/g;

// Bare URL
const RE_BARE = /\bhttps?:\/\/[^\s)\]]+/g;

// t.me links
const RE_TME = /\bt\.me\/[A-Za-z0-9_+\-/]+/g;
// ↑ ajústalo según lo que veas arriba
```