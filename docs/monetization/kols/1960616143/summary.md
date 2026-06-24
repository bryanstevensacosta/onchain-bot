# KOL 1960616143 — formato analizado

- Tipo: Channel
- Title: SpyDefi
- Username: @(sin username)
- Resolved as: -1001960616143
- Mensajes muestreados: 50
- Mensajes con URLs: 50 (100%)
- Mensajes con media: 50 (100%)
- URLs extraídas por fuente:
  - entity_text_url: 233
- Longitud media: 170 chars

## Ejemplo anonimizado

```
Achievement Unlocked: x5! 👋

@persian_gambles made a x5+ call on Totem. 

$76K ➡️ $386K

👁 View Call 📊 View Stats

🟦 GITLAWB - TRENDING #2
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