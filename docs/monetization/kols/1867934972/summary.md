# KOL 1867934972 — formato analizado

- Tipo: Channel
- Title: KOL Trending (@CallAnalyser)
- Username: @walloftrophies
- Resolved as: -1001867934972
- Mensajes muestreados: 50
- Mensajes con URLs: 50 (100%)
- Mensajes con media: 27 (54%)
- URLs extraídas por fuente:
  - entity_text_url: 164
- Longitud media: 80 chars

## Ejemplo anonimizado

```
🔥Thanos Gems 💎 just made a 6X Call on $JTVO🔥🔥
——-
Thanos Gems 💎 is T2 on @CallAnalyser with 622 CPW

Total Calls | Chart | @CallAnalyser
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