# docs-money/scripts/fetch-kol-samples.md

> **Documentación** del script [`scripts/fetch-kol-samples.mjs`](../../scripts/fetch-kol-samples.mjs).
> Este archivo `.md` es solo doc; el script ejecutable es el `.mjs` en la raíz del repo.

---

## Estado del script

| Versión | Ubicación | Estado |
|---|---|---|
| Ejecutable | `scripts/fetch-kol-samples.mjs` | ✅ Funciona (`node --check` pasa, `--help` responde) |
| Doc | `docs-money/scripts/fetch-kol-samples.md` | Este archivo |
| Salida | `docs-money/kols/<id>/` (raw.json + urls.json + summary.md) | Vacío hasta ejecutar |

---

## Uso rápido

```bash
# Desde la raíz del repo
node scripts/fetch-kol-samples.mjs --kol 1867934972 --kol 2397610468 --kol 1960616143 --limit 50
```

Flags:
- `--kol <id>` — ID de Telegram (repetible). Acepta positivo, negativo, o `-100` prefix.
- `--limit <n>` — mensajes por KOL (default 50, **máximo 200**, hard cap).
- `--output <dir>` — directorio de salida (default `docs-money/kols/`).
- `--interactive` — si no hay session string en `.env`, hace login manual.
- `--help` / `-h` — muestra esta ayuda.

---

## Cómo extrae las URLs

El script usa dos métodos (en este orden):

### 1. Entities de Telegram (método principal)

Telegram marca cada URL en el mensaje con un entity. El script mapea:

| Entity className | Tipo de URL | Fuente |
|---|---|---|
| `MessageEntityTextUrl` | `(texto)[url]` y `[texto](url)` | `entity.url` |
| `MessageEntityUrl` | URLs bare (`https://...`) | `text.substring(offset, offset + length)` |

Los offsets son **UTF-16 code units** (no UTF-8 bytes). JS strings son UTF-16
internamente, así que `text.substring(offset, offset + length)` funciona.

### 2. Regex fallback

Por si algún entity se perdió (clientes rotos, edge cases):

```js
const RE_MD_V1 = /\(([^()]+?)\)\[([^\]\s]+?)\]/g;          // (texto)[url]
const RE_MD_V2 = /\[([^\]\n]+?)\]\(([^\s)]+?)\)/g;          // [texto](url)
const RE_BARE  = /\bhttps?:\/\/[^\s)\]]+/g;                  // bare URL
const RE_TME   = /\bt\.me\/[A-Za-z0-9_+\-/]+/g;             // t.me links
```

---

## Rate limiting defensivo

| Espera | Default |
|---|---|
| Entre KOLs | 5s |
| Entre batches de mensajes | 100ms |

Esto simula "human behavior" para no gatillar FloodWait. Si recibes un
`FLOOD_WAIT_X`, el script respeta el backoff de gramJS automáticamente.

---

## Output por KOL

```
docs-money/kols/1867934972/
├── raw.json                         ← array de Telegram messages completos
├── urls.json                        ← array de {text, url, source, messageId}
└── summary.md                       ← estadísticas + ejemplo anonimizado
```

`summary.md` ejemplo:

```markdown
# KOL 1867934972 — formato analizado

- Tipo: Channel
- Title: Some Alpha Channel
- Username: @somealphachannel
- Resolved as: -1001867934972
- Mensajes muestreados: 50
- Mensajes con URLs: 47 (94%)
- Mensajes con media: 12 (24%)
- URLs extraídas por fuente:
  - entity_text_url: 41
  - entity_url: 6
  - regex_tme: 3
- Longitud media: 234 chars

## Ejemplo anonimizado

```
🚨 $XYZ alpha call
Contract: 0x<CA>
Chart: (ver)[<URL>]
Group: (t.me/...)[<URL>]
```

## Regex recomendado

(copia el que mejor matchee con los ejemplos que veas arriba)
```

---

## Después de usar

```bash
# 1. Revisa los summary.md para entender el formato
cat docs-money/kols/1867934972/summary.md

# 2. Mira 5-10 mensajes crudos
less docs-money/kols/1867934972/raw.json

# 3. Diseña tu extractor/formatter imitando el formato

# 4. BORRA los datos descargados
rm -rf docs-money/kols/1867934972
rm -rf docs-money/kols/2397610468
rm -rf docs-money/kols/1960616143

# 5. Añade a .gitignore para evitar futuras subidas accidentales
echo "docs-money/kols/[0-9]*/" >> .gitignore
echo "!docs-money/kols/README.md" >> .gitignore

# 6. Opcionalmente borra el script mismo
rm scripts/fetch-kol-samples.mjs
```

---

## Compliance

- **Permitido**: descarga puntual de N mensajes públicos para análisis de
  formato. "Ordinary use" bajo Content Licensing ToS.
- **NO permitido**: pipeline automático que persiste miles de mensajes
  (eso es exactamente lo que `fix-1/problem.md` previene).

---

## Próximo paso

1. Rellena `TELEGRAM_MTPROTO_*` en `.env`.
2. Ejecuta el script desde tu máquina local.
3. Itera sobre `MessageFormatterPort` y `RegexBasedExtractorAdapter`.
4. Borra los datos descargados.
5. Vuelve a `fix-1/solution.md` para terminar el fix anti-scraping.

> **One-off script** para análisis competitivo: descarga los últimos N mensajes
> de KOLs específicos de Telegram y los guarda en `docs-money/kols/<id>/` para
> que tengas referencia del formato (texto + URLs incrustadas como
> `(texto)[url]` MarkdownV1).
>
> ⚠️ **NO es parte del pipeline**. Es investigación puntual. Después de obtener
> el formato, **borra este script y los datos descargados**. Mantén solo
> `docs-money/kols/README.md` con la descripción del formato aprendido.

---

## 0. Disclaimer importante

```
NUNCA CORRAS ESTE SCRIPT EN PRODUCCIÓN.
NUNCA LO AGREGUES A UN CRON O WORKFLOW AUTOMATIZADO.
DESPUÉS DE CAPTURAR EL FORMATO, BORRA EL SCRIPT Y LOS DATOS DESCARGADOS.
```

Razones:
- El texto de los mensajes **no debe persistirse** (ver `fix-1/problem.md`).
- Este script existe solo para que tu equipo humano entienda el formato que
  usan canales establecidos y diseñar tu extractor en consecuencia.
- Una vez que tengas el regex / parser, tu extractor opera sobre los
  metadatos derivados (CAs, tickers, URLs) sin guardar el texto.

Legal: la descarga puntual de un número limitado de mensajes públicos para
análisis de formato es "ordinary use" bajo Content Licensing ToS
[https://telegram.org/tos/content-licensing]. Lo que NO es legal es construir
un pipeline que persiste esos textos a escala.

---

## 1. Requisitos

- Node ≥ 20
- `npm install telegram` (ya está en tus deps para el backend)
- `.env` con `TELEGRAM_MTPROTO_API_ID`, `_HASH`, `_SESSION` rellenos
  (obtener credenciales en https://my.telegram.org)

---

## 2. Uso

```bash
# Desde la raíz del repo
node scripts/fetch-kol-samples.mjs --kol 1867934972 --kol 2397610468 --kol 1960616143 --limit 50

# Si la sesión MTProto no está en .env, te pedirá login interactivo
node scripts/fetch-kol-samples.mjs --kol 1867934972 --limit 20 --interactive
```

Flags:
- `--kol <id>` — ID de Telegram (puede repetirse). Acepta ID positivo, negativo,
  o con prefijo `-100`.
- `--limit <n>` — mensajes por KOL (default 50, máximo 200).
- `--output <dir>` — directorio de salida (default `docs-money/kols/`).
- `--interactive` — si la sesión no existe, hace login manual.

---

## 3. Lo que hace

1. Carga `.env` desde la raíz del repo.
2. Conecta vía MTProto usando `TELEGRAM_MTPROTO_*` env vars.
3. Para cada `--kol <id>`:
   a. Resuelve el entity (puede ser User, Chat, o Channel).
   b. Si es canal/grupo: descarga los últimos N mensajes.
   c. Si es user: descarga los últimos N mensajes del chat con ese user.
4. Para cada mensaje:
   a. Extrae entities tipo `MessageEntityTextUrl` (Markdown `(text)[url]`).
   b. Extrae entities tipo `MessageEntityUrl` (URLs bare).
   c. Aplica regex de fallback para capturar patrones que Telegram no marcó
      como entity.
5. Guarda:
   - `docs-money/kols/<slug>/raw.json` — mensaje completo (incluye `text`,
     `entities`, `date`, `from_id`, etc.).
   - `docs-money/kols/<slug>/urls.json` — array de
     `{ text, url, source: 'entity' | 'regex', messageId, offset }`.
   - `docs-money/kols/<slug>/summary.md` — resumen humano: tipo de entity,
     # de URLs, # de mensajes con `(text)[url]`, ejemplo anonimizado.

---

## 4. Extracción de URLs (lógica del script)

### 4.1 Vía entities (método principal)

Telegram devuelve los `MessageEntity` con `offset`, `length`, y (para text_link)
el `url`. El script mapea:

```js
const offset = entity.offset;
const length = entity.length;
const visibleText = text.substring(offset, offset + length);
const url = entity.url;        // solo para MessageEntityTextUrl
```

Tipos relevantes:
- `MessageEntityTextUrl` (`text_link`) — corresponde a Markdown `(text)[url]`
  y `[text](url)`. Tiene `url` en el entity.
- `MessageEntityUrl` (`url`) — URLs bare dentro del texto. El entity marca el
  rango, el script extrae `text.substring(offset, offset + length)`.
- `MessageEntityMention` (`mention`) — `@username` references.
- `MessageEntityEmail` (`email`) — emails.

### 4.2 Regex fallback (defensivo)

Por si algún mensaje no trae entity (ej: textos copiados que rompen el parser
del cliente):

```js
// MarkdownV1 inline link: (texto)[url]
const MD_V1_LINK = /\(([^()]+?)\)\[([^\]\s]+?)\]/g;

// MarkdownV2 inline link: [texto](url)
const MD_V2_LINK = /\[([^\]\n]+?)\]\(([^\s)]+?)\)/g;

// Bare URL
const BARE_URL = /\bhttps?:\/\/[^\s)\]]+/g;

// t.me link
const TME_LINK = /\bt\.me\/[A-Za-z0-9_+\-/]+/g;
```

El script aplica estos regex solo sobre mensajes donde `entities` está vacío
o donde las entities no cubren el texto completo.

---

## 5. Estructura del output

```
docs-money/kols/
├── README.md                            ← generado por el script
├── 1867934972/                          ← si se resolvió como canal
│   ├── raw.json                         ← array de Telegram messages
│   ├── urls.json                        ← array de {text, url, source, ...}
│   └── summary.md                       ← estadísticas + ejemplo anonimizado
├── 2397610468/
│   ├── raw.json
│   ├── urls.json
│   └── summary.md
└── 1960616143/
    ├── raw.json
    ├── urls.json
    └── summary.md
```

`summary.md` ejemplo:

```markdown
# KOL 1867934972 — formato analizado

- Tipo: Channel (broadcast)
- Título: <resolved title>
- Mensajes muestreados: 50
- Mensajes con URLs: 47 (94%)
- Mensajes con formato `(texto)[url]`: 41 (82%)
- Mensajes con `[texto](url)`: 6 (12%)
- Mensajes con URL bare: 3 (6%)

## Ejemplo anonimizado (estructura, NO contenido)

Formato típico:

  <header line>             ← ej: ticker, market cap, sentiment
  <body line 1>             ← ej: descripción del call
  (texto)[https://...]      ← link a chart (DexScreener, DexTools)
  (texto)[https://...]      ← link a CA explorer
  (texto)[https://t.me/...] ← link a Telegram del KOL o grupo

## Regex recomendado

\(([^()]+?)\)\[(https?://[^\]\s]+?)\]

## Métricas de longitud

- Longitud media: 234 chars
- Mensajes con media: 12 (24%)
- Mensajes con entities: 47 (94%)
```

---

## 6. Limitaciones de seguridad del script

| Límite | Default | Por qué |
|---|---|---|
| Mensajes por KOL | 50 | Suficiente para entender formato, no tanto como para considerarlo scraping masivo |
| Máximo absoluto por KOL | 200 | Hard cap — el script rechaza valores mayores |
| Rate entre mensajes | 100ms | Simula "human behavior" para no gatillar FloodWait |
| Rate entre KOLs | 5s | Pausa entre canales para no ser flagged |
| Reintentos por FloodWait | 3 | Si Telegram dice "espera 30s", el script espera y reintenta |
| Persistencia | Solo archivos locales | Nada va a DB, nada se sube a la nube |

---

## 7. Después de usar el script

1. **Revisa `summary.md`** de cada KOL para entender el formato.
2. **Actualiza el extractor** (`apps/backend/src/token/intake/extraction/
   infrastructure/adapters/regex-based-extractor.adapter.ts`) con el regex
   aprendido.
3. **Borra los datos descargados**:
   ```bash
   rm -rf docs-money/kols/{1867934972,2397610468,1960616143}
   ```
4. **Borra el script**:
   ```bash
   rm scripts/fetch-kol-samples.mjs
   ```
5. **Añade a .gitignore** por si se vuelve a correr accidentalmente:
   ```
   docs-money/kols/*/
   !docs-money/kols/README.md
   ```
6. **Mantén solo `docs-money/kols/README.md`** con la descripción del formato
   que aprendiste (regex + estructura típica + métricas de longitud).

---

## 8. Próximo paso

Una vez que tengas el formato aprendido, vuelve a `fix-1/solution.md` para
terminar el fix del scraping. El extractor actualizado debería usar el regex
que aprendiste pero **sin persistir el texto** (que es justo lo que arregla
fix-1).
