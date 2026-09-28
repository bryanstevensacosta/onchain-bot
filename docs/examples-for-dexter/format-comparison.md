# Format Comparison — raw vs entities vs GitHub-md vs HTML vs MarkdownV2

Source: `rick-bot-scanner.md` — group `Ganster Degen Callz 🎲`
(`-1004344872725`), fetched 2026-09-28 ~02:37 UTC via staging-twin MTProto
session, entities transcribed ~03:00 UTC via `GET /debug/telegram/message/…`.
All ids/timestamps verbatim from the API.

Representatives (one trigger + one bot reply, same thread cluster
`64102 → 64103/64104/64105/64106/64107`):

- **Trigger — id 64102** — forwarded `🚀 MILESTONE`, no media, top-level,
  4 entities (shown **in full**).
- **Bot reply — id 64107** — Proficy card (from `5457577145`),
  media `MessageMediaWebPage`, 64 entities (shown as **excerpt**;
  full table + full formatted version in source doc).

Offset convention (from source, validated): `offset`/`length` are **UTF-16
code units** (Telegram standard), NOT Python-char indices — they diverge
after the first astral char (emoji). E.g. `Bold off=19 len=2` = `🟢`
(1 Python char, 2 UTF-16 units); naive Python slicing drifts every later
span by −1 per preceding emoji.

---

## 1. Trigger — id 64102 (full)

### (a) Raw plain text

```text
🚀 MILESTONE 33x 🔷 $ETHEREUM

MC: $131.7K → $10.06M
0x5b4c3e76df54babf45e9478ccdfe850f77100000
```

### (b) Entities table (full — 4 rows, verbatim from source)

| #   | type    | offset | length | span                                       | extra |
| --- | ------- | ------ | ------ | ------------------------------------------ | ----- |
| 0   | Cashtag | 20     | 9      | $ETHEREUM                                  |       |
| 1   | Code    | 35     | 7      | $131.7K                                    |       |
| 2   | Code    | 45     | 7      | $10.06M                                    |       |
| 3   | Code    | 53     | 42     | 0x5b4c3e76df54babf45e9478ccdfe850f77100000 |       |

### (c) GitHub-markdown render (verbatim from source §id 64102)

```markdown
🚀 MILESTONE 33x 🔷 $ETHEREUM

MC: `$131.7K` → `$10.06M`
`0x5b4c3e76df54babf45e9478ccdfe850f77100000`
```

Legend used: `Cashtag`→verbatim (no md syntax), `Code`→`` `…` ``.

### (d) HTML render (derived from (a)+(b) for this doc)

```html
<p>🚀 MILESTONE 33x 🔷 $ETHEREUM</p>
<p>MC: <code>$131.7K</code> → <code>$10.06M</code></p>
<p><code>0x5b4c3e76df54babf45e9478ccdfe850f77100000</code></p>
```

Notes: `Cashtag` has no HTML semantic equivalent — rendered as verbatim
text (a frontend could wrap it in `<span class="cashtag">` for styling).
`Code` → `<code>`. No links, no nesting, no custom emoji in this message.

### (e) Telegram MarkdownV2 version (derived from (a)+(b) for this doc)

```text
🚀 MILESTONE 33x 🔷 $ETHEREUM

MC: `$131\.7K` → `$10\.06M`
`0x5b4c3e76df54babf45e9478ccdfe850f77100000`
```

Escaping notes (MarkdownV2 reserved set
`_ * [ ] ( ) ~ \` > # + - = | { } . !`— must be`\`-escaped outside
entities, and `code` spans too where the char is reserved):

- `$ETHEREUM` (Cashtag): `$` is NOT reserved — verbatim, no entity syntax.
- `$131.7K` → `$131\.7K` inside backticks: `.` IS reserved, so escaped
  even inside `` `…` `` in MarkdownV2 (unlike GitHub-md).
- `→` : not reserved — verbatim.
- Contract hex: `[0-9a-fx]` only — no escaping needed inside backticks.

---

## 2. Bot reply — id 64107 (excerpt)

Slice used for all five renders below (same message lines — head, one
stats/link line, contract + audit line, promo line):

```text
‌‌‌‌‎PERPS (PERPS) 🟢 v4 HOOD $0.0000705447859856676
MC: $61.5K | Liq: $9.07K  | Age: 6d
Links: TG | X | Web | Lore
0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000
CA: Verified, Renounced (check for hidden functions)
PROMO: ☀️ Trade PERPS on GMGN ☀️‎
```

(First line carries 4× U+200C + 1× U+200E invisible prefix — preserved,
not shown. `💻` CustomEmoji line and `/c_…` BotCommand line are covered
via entity rows #46/#52, renders for those two rows inline below.)

### (a) Raw plain text — see slice above (verbatim API `message` text).

### (b) Entities table excerpt (12 rows of 64, verbatim from source)

| #   | type        | offset | length | span                                       | extra                                                                                 |
| --- | ----------- | ------ | ------ | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| 5   | TextUrl     | 5      | 13     | PERPS (PERPS)                              | https://t.me/ProficyPriceBot?start=0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000         |
| 6   | Bold        | 5      | 13     | PERPS (PERPS)                              |                                                                                       |
| 7   | Bold        | 19     | 2      | 🟢                                         |                                                                                       |
| 12  | Bold        | 161    | 10     | MC: $61.5K                                 |                                                                                       |
| 16  | TextUrl     | 204    | 2      | TG                                         | https://t.me/perpmarkets                                                              |
| 25  | TextUrl     | 297    | 7      | Holders                                    | https://t.me/ProficyPriceBot?start=wh-rh-0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000-s |
| 26  | Bold        | 297    | 7      | Holders                                    | (nested: same span as #25 → nested render)                                            |
| 46  | BotCommand  | 419    | 13     | /c_0f77100000                              |                                                                                       |
| 52  | CustomEmoji | 475    | 2      | 💻                                         | documentId=4994784010170272091                                                        |
| 59  | Code        | 523    | 42     | 0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000 |                                                                                       |
| 61  | Bold        | 620    | 6      | PROMO:                                     |                                                                                       |
| 62  | TextUrl     | 627    | 25     | ☀️ Trade PERPS on GMGN ☀️                  | https://gmgn.ai/robinhood/token/proficy_0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000    |

### (c) GitHub-markdown render (constituent lines, verbatim from source §id 64107)

```markdown
[**PERPS (PERPS)**](https://t.me/ProficyPriceBot?start=0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000) **🟢** v4 HOOD $0.0000705447859856676
**MC: $61.5K** | **Liq:** $9.07K | **Age:** 6d
**Links:** [TG](https://t.me/perpmarkets) | [X](https://x.com/perpmarkets?s=11&t=zGMHK2HzrG35O7sWjUImHw) | [Web](https://perpmarkets.fun/) | [Lore](https://t.me/ProficyPriceBot?start=lo-rh-0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000-s)
`0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000`
**CA: **Verified, Renounced (check for hidden functions)
**PROMO:** [☀️ Trade PERPS on GMGN ☀️](https://gmgn.ai/robinhood/token/proficy_0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000)[‎](https://ztokenowner.com/777000)
```

Legend used: `Bold`→`**…**`, `TextUrl`→`[…](url)`,
`Code`→`` `…` ``, `BotCommand`→verbatim (`/c_0f77100000` — no md syntax),
`CustomEmoji`→verbatim span (`💻` kept as-is; `documentId` in table only).
Nested entities render nested (`[…](…)` outer, `**…**` inner at identical
spans — cf. rows #25/#26: `[**Holders**](…)` in the full formatted block).

### (d) HTML render (derived from (a)+(b) for this doc)

```html
<p>
  <a
    href="https://t.me/ProficyPriceBot?start=0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000"
    ><b>PERPS (PERPS)</b></a
  >
  <b>🟢</b> v4 HOOD $0.0000705447859856676
</p>
<p><b>MC: $61.5K</b> | <b>Liq:</b> $9.07K | <b>Age:</b> 6d</p>
<p><b>Links:</b> <a href="https://t.me/perpmarkets">TG</a> | …</p>
<p>
  <a
    href="https://t.me/ProficyPriceBot?start=wh-rh-0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000-s"
    ><b>Holders</b></a
  >
</p>
<p>
  Chart: <code>/c_0f77100000</code> | <b>🫧 Map:</b> <code>/b_0f77100000</code>
</p>
<p>
  💻 <img alt="💻" data-custom-emoji-id="4994784010170272091" />-as-text
  fallback
</p>
<p><code>0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000</code></p>
<p><b>CA: </b>Verified, Renounced (check for hidden functions)</p>
<p>
  <b>PROMO:</b>
  <a
    href="https://gmgn.ai/robinhood/token/proficy_0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000"
    >☀️ Trade PERPS on GMGN ☀️</a
  >
</p>
```

Mapping used: `Bold`→`<b>`, `Italic`→`<i>`, `TextUrl`→`<a href>`,
`Code`/`Pre`→`<code>`/`<pre>`, `Blockquote`→`<blockquote>` (cf. id 64093
`>  ⚠️ _Low Liquidity_` in source), nesting preserved (`<a><b>…</b></a>`
for rows #25/#26). `BotCommand` → `<code>` (no link semantics; verbatim
is equally valid). `CustomEmoji` → real glyph is LOST client-side without
the sticker pack: render `alt` (= raw span char, here `💻`) + keep
`documentId=4994784010170272091` as data attribute — note below.

> Custom-emoji note: the span char (`💻`) is a placeholder, NOT the
> artwork users see in Telegram (that comes from `documentId`). Any HTML
> render must treat it as opaque: show `alt` text, never assume the glyph
> matches. Same caveat as the GitHub-md column, where the emoji is kept
> verbatim and the `documentId` lives only in the table.

### (e) Telegram MarkdownV2 version (derived from (a)+(b) for this doc)

```text
[PERPS \(PERPS\)](https://t.me/ProficyPriceBot?start=0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000) *🟢* v4 HOOD $0\.0000705447859856676
*MC: $61\.5K* \| *Liq:* $9\.07K  \| *Age:* 6d
*Links:* [TG](https://t.me/perpmarkets) \| [X](https://x\.com/perpmarkets?s=11&t=zGMHK2HzrG35O7sWjUImHw) \| \.\.\.
`0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000`
*CA: *Verified, Renounced \(check for hidden functions\)
*PROMO:* [☀️ Trade PERPS on GMGN ☀️](https://gmgn.ai/robinhood/token/proficy_0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000)
```

Escaping notes:

- Bold `**…**` (GitHub) → `*…*` (MarkdownV2 single asterisk).
- `(`, `)`, `.`, `|`, `!` escaped EVEN inside link text / plain text
  (`PERPS \(PERPS\)`, `$0\.…`, `\|` separators, `x\.com`).
- URLs in `(URL)` part: `?`, `=`, `&`, `:`, `/` are NOT reserved — verbatim;
  only `)` and `\` inside a URL need escaping (none occur here).
- `BotCommand` `/c_0f77100000`: `_` IS reserved → must send as
  `/c\_0f77100000` (or inside backticks — backtick content still needs
  `` ` `` and `\` escaping only, so `` `/c_0f77100000` `` is safe).
- `CustomEmoji` has NO MarkdownV2 entity — send the raw span char
  verbatim (`💻`); artwork fidelity is lost either way (see HTML note).
- `Pre` language suffix and `Blockquote` `>` / `>>` prefixes are native in
  MarkdownV2 (no escaping of the marker itself; content escaped normally).
- Zero-width/invisible prefix chars (U+200C/U+200E): strip before sending
  — MarkdownV2 has no invisible-TextUrl trick; keep only if you
  deliberately need `ztoken*` tracking links (prefer explicit `[‌](url)`).

---

## 3. Verification (renders derived from same message)

- Trigger 64102: all 4 entity offsets re-checked with a UTF-16 code-unit
  slicer against the raw text — `20/9=$ETHEREUM`, `35/7=$131.7K`,
  `45/7=$10.06M`, `53/42=contract` — all land exactly (total 95 units;
  `🚀`/`🔷` count 2 each, confirming UTF-16 not Python-char indexing).
- Reply 64107 head spans re-checked the same way — `5/13=PERPS (PERPS)`,
  `19/2=🟢`, `65/5=Price`, `81/6=Volume`, `96/3=B/S` — all land; deeper
  offsets (#12+) depend on exact source whitespace and are covered by the
  source doc's own verification (counts `64107=64`, `64093=34`, `64102=4`
  match; link spot-checks `[TG](https://t.me/perpmarkets)`,
  `[X](https://x.com/perpmarkets?s=11&t=…)`, `` `$131.7K` `` pass).
- (c) blocks are copied verbatim from source (not re-typed); (d)/(e) were
  derived row-by-row from (a)+(b) above — any mismatch vs (c) is a bug in
  (d)/(e), re-derive from the table, never hand-edit to match (c).

---

## 4. Decision matrix for our dexter

| Concern                            | Candidates                 | Winner            | Why                                                                                                              |
| ---------------------------------- | -------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Parsing (extract CA, links, stats) | raw regex vs entities JSON | **entities JSON** | Offsets are exact (UTF-16); links arrive resolved (no URL reconstruction); nesting explicit                      |
| Display in bot messages            | HTML vs MarkdownV2         | **MarkdownV2**    | Native to Bot API (`parse_mode: MarkdownV2`); links/buttons render inline; no web preview needed                 |
| Display in frontend                | MarkdownV2 vs HTML         | **HTML**          | Browsers render it directly (React `dangerouslySetInnerHTML` after sanitize, or AST→JSX); GH-md needs a pipeline |
| Storage                            | formatted vs raw+entities  | **raw+entities**  | Any render re-derivable (this doc proves 3 from 1); formatted text bakes in one presentation and loses offsets   |

## RECOMMENDATION

**RECOMMENDATION: parse from entities JSON, store raw text + entities JSON, render MarkdownV2 for bot messages and HTML for the frontend (never store rendered output).**
