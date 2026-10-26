# Dexter — Rick compact card parity (BSC / KODA)

**Estado:** spec revisada (oracle round 2: READY, sin P0); pendiente OK del owner sobre D1/D2/D4/D5/D6/D8; NO se ha tocado código.
**Fecha:** 2026-10-22
**Scope:** `apps/market-data` + `apps/dexter-onchain-bot` + seed de DisplayMaps + body del template
**Fuera de scope:** prod/master, proveedores pagos, backfill histórico, tarjeta completa de Rick (holders/dev/1H/socials), cambios al contrato `honeypot` que rompan dexter.

---

## 1. Objetivo

Acercar el compact card de Dexter al ejemplo real de RickBurpBot para KODA (BSC), **sin inventar datos**:

```
🟡 Koda [749/-3%] $KODA
🌐 BNB @ Pancakeswap V2
💰 USD: 0.00007707
💎 FDV: 749 ⇨ 2.6K [7d]
💦 Liq: 396 ⚠️🔒
📊 Vol: 32 ⋅ Age: 7d

🍯 SIM: OK ⋅ T: 0/3
```

Nuestro render actual (misma DB/template, snapshot live):

```
Koda [751/1.1%] $KODA
🟡 BNB @ Pancakeswap V2
💰 USD: `0.00007707`
💎 FDV: `751` ⇨ `2.5K` [`1w`]
💦 Liq: `787` [`x1`]
📊 Vol: `2` ⋅ Age:
🍯 T: 0/2.97
```

**Meta:** igualar la _estructura_ (iconos, venue corto, Liq one-side, ⚠️🔒, Age 7d, SIM). Los números exactos de Rick (`-3%`, `32`, `749`, `2.6K`) son diferencias de proveedor/timestamp y **no se falsifican**.

---

## 2. Evidencia live (2026-10-22, Oracle/staging host)

Token KODA BSC: `0xd3775c4D5C517AaCAe0CCF906DCD96713b5749cF`
Par PancakeV2: `0xaf2dd3d6371be505fb38fe865f1fde1eaea28da0`

| Fuente                               | Resultado                                                                                                                                                                                                                                                                                                                 | Uso propuesto                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| GoPlus `token_security/56` (keyless) | `is_honeypot:"0"`, `cannot_buy:"0"`, `cannot_sell_all:"0"`, `buy_tax:"0"`, `sell_tax:"0.0297"` (=2.97%), `holder_count:"21"`                                                                                                                                                                                              | **SIM + taxes** (cero llamada extra: ya está cableado)        |
| GoPlus `lp_holders`                  | `PinkLock02` `0x4079…1bbe` `percent:"0.999999999999999999"` `is_locked:1` `locked_detail.end_time:"2027-12-01T14:47:00+00:00"`; `Null Address` `percent:"0"` `is_locked:1`                                                                                                                                                | **🔒** (locked≈100%, burned=0)                                |
| GoPlus `dex[]`                       | `PancakeV2` `liquidity:"392.40209577"`; otros V4 0.708 / 0.495                                                                                                                                                                                                                                                            | evidencia de que Rick muestra **one-side** (392 ≈ 396)        |
| GeckoTerminal pool                   | `reserve_in_usd:787.253`, `volume_usd.h24:1.5719`, `price_change_percentage.h24:0`, `pool_created_at:2026-10-14T14:30:02Z`                                                                                                                                                                                                | Liq total / Vol / change / **Age**                            |
| DexScreener                          | `/latest/dex/tokens/<KODA>` → `pairs:null`; `/latest/dex/pairs/bsc/<pair>` → `pairs:null`; CAKE control → 200                                                                                                                                                                                                             | **no sirve** para KODA; no es un bug nuestro                  |
| honeypot.is v2 (free, sin auth)      | KODA token y pair → `404 {"error":"pair not found"}`; CAKE → `200`, `simulationSuccess:true`, `isHoneypot:false`, `buyTax:0/sellTax:0`, `pair.createdAtTimestamp`                                                                                                                                                         | **no confiable para tokens nuevos/chicos**; fallback opcional |
| Dev DB `dexter_db`                   | `dexter_message_templates` `bare/RickBurpBot` v15 (inactivo); `dexter_display_maps` `chain/bsc/🟡`                                                                                                                                                                                                                        | body target + seed BSC                                        |
| Código                               | `resolveVenue` **ya** hace `getTokenPools` + `selectPoolQuote` pero hardcodea `pairCreatedAtMs: null` (L774), aunque `pick.poolCreatedAtMs` viene de GT `pool_created_at`; `formatCompactAgeText` usa `1w` desde 7d (L235-237); `classifyTokenSecurity` fija `sim:null` (Fase 1); `DEX_DISPLAY` no tiene `pancakeswap_v2` | causas raíz                                                   |

### 2.1 Lo que Rick muestra y no podemos igualar con fuentes gratis para KODA

| Campo                  | Rick      | Nuestro live | Causa                                              | Acción                          |
| ---------------------- | --------- | ------------ | -------------------------------------------------- | ------------------------------- |
| `priceChange24h`       | -3%       | 0%           | GT reporta 0; DexScreener no indexa el par         | **No tocar**; documentar        |
| `volume24hUsd`         | 32        | 1.5719 → `2` | GT es la única fuente; DexScreener null            | **No tocar**                    |
| `fdvUsd`               | 749       | 751          | precio/supply/timestamp                            | **No tocar**                    |
| `fdvAth` / `fdvAthAgo` | 2.6K [7d] | 2.5K [1w]    | historia propia 90d + clamp todo-68; age formatter | `1w`→`7d`; ATH se queda         |
| `T`                    | 0/3       | 0/2.97       | Rick redondea; nosotros medimos                    | **Mantener 2.97** (precisión)   |
| `SIM`                  | OK        | ausente      | `sim` siempre null en Fase 1                       | GoPlus verdict (ver D1)         |
| `🔒`                   | sí        | ausente      | RugCheck es Solana-only; nadie llenaba lock en BSC | GoPlus `lp_holders`             |
| `Liq`                  | 396       | 787          | Rick muestra one-side; nosotros total              | display-only `total/2` (ver D4) |

---

## 3. Gaps priorizados

### P0 — bloquean el render objetivo

| #     | Capa           | Gap                                                                                                                          | Acción                                                                                                                                |
| ----- | -------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| P0-1  | Template       | Header arranca con `{{launchpadIconLink}}` (vacío en BSC); Rick usa el emoji de chain                                        | Nuevo `{{headerIcon}}` (launchpad link si existe, si no `chainDisplay`)                                                               |
| P0-2  | Template       | Línea venue usa `{{chainDisplay}}`; Rick usa `🌐`                                                                            | Body: `🌐 {{chainName}}{{venueSuffixShort}}`                                                                                          |
| P0-3  | Template       | `{{venueSuffix}}` largo; Rick `@ Pancakeswap V2` / `@ Pump`                                                                  | Usar `venueSuffixShort`                                                                                                               |
| P0-4  | Template       | `Liq` usa total + `[x1]`; Rick one-side + `⚠️🔒` sin ratio                                                                   | `{{liquidityUsdSide}}` + `{{liquidityFlags}}`; quitar `[{{liquidityRatio}}]` del body                                                 |
| P0-5  | Dexter derived | No existen `headerIcon`, `liquidityUsdSide`, `liquidityFlags`                                                                | Agregar a registry + renderer + tests                                                                                                 |
| P0-6  | Market-data    | `sim` siempre null                                                                                                           | Mapear GoPlus `is_honeypot`/`cannot_buy`/`cannot_sell_all` a `sim:'ok'                                                                | 'fail' | null` |
| P0-7  | Market-data    | `lockedLiquidityPercent`/`burnedPercent` null en BSC                                                                         | Mapear `lp_holders` (fracción ×100; null address = burned; `is_locked=1` = locked)                                                    |
| P0-8  | Market-data    | `resolveVenue` ya hace `getTokenPools` + `selectPoolQuote`, pero **descarta** `pick.poolCreatedAtMs` (hardcode `null`, L774) | **Una línea**: `pairCreatedAtMs: pick.poolCreatedAtMs ?? null`; cero llamadas extra. Actualizar el comentario stale de `resolveVenue` |
| P0-9  | Formatter      | Edad 7-29d sale `1w`                                                                                                         | Eliminar rung `w`: 7-29d → `Nd`; 30d+ sigue `mo`                                                                                      |
| P0-10 | Seed           | `display-maps.seed.json` no tiene BSC                                                                                        | Agregar `(chain,bsc,🟡)` (fila verificada en dev DB)                                                                                  |
| P0-11 | Template DB    | Body v15 no coincide con el target                                                                                           | Aplicar body nuevo (manual/editor) **después** del deploy de código                                                                   |
| P0-12 | Dexter venue   | `DEX_DISPLAY` no tiene `pancakeswap_v2`; el fallback Gecko renderiza `Pancakeswap_v2` (no `Pancakeswap V2`)                  | Agregar `pancakeswap_v2: 'Pancakeswap V2'` (y `pancakeswap_v3: 'Pancakeswap V3'`) en `venue-display.ts` + test                        |

### P1 — robustez / fidelidad, no bloquean KODA

| #    | Gap                                                                                                | Acción                                                                                                                                                                                                                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| P1-1 | `{{honeypotLine}}` pega `\n🍯` (sin línea en blanco); Rick tiene blank line                        | Nuevo `{{honeypotBlock}}` (`\n\n🍯`), usado inline tras `Age`; `honeypotLine` queda byte-idéntico                                                                                                                                                                                                                        |
| P1-2 | Si `age` es null queda `⋅ Age:` colgado                                                            | Nuevo `{{ageSuffix}}` (` ⋅ Age: \`7d\``o`''`)                                                                                                                                                                                                                                                                            |
| P1-3 | `[{{name}}]({{botStartUrl}})` con URL vacía deja `[Name]()`                                        | Nuevo `{{nameLink}}` (`[**Name**](url)` o `**Name**` si no hay URL)                                                                                                                                                                                                                                                      |
| P1-4 | El flip de `sim` agrega `SIM: OK` a templates que ya usan `{{honeypotLine}}`                       | **Inventariado 2026-10-22: 0 templates ACTIVOS** en dev y staging usan `{{honeypotLine}}` (solo el `RickBurpBot` v15 inactivo de dev). El blast radius real empieza cuando se aplique/active el body nuevo (gate D10); kill-switch `SNAPSHOT_SIM_VERDICT_ENABLED` (default true) para apagar el verdict sin perder taxes |
| P1-5 | Fast-path cards omiten el tail de honeypot/venue (leg saltado) ⇒ no hay `SIM`/`🔒`/`pairCreatedAt` | Documentar; no es un gap del compact path lento; no forzar el leg en fast-path                                                                                                                                                                                                                                           |
| P1-6 | `name`/`symbol` largos, escape, truncado                                                           | Ya cubierto por formatter/escape; test de body completo                                                                                                                                                                                                                                                                  |
| P1-7 | `nameLink` debe honrar la procedencia `(unverified)` y el default del `{{name}}`                   | Reusar el helper de `name` (incluye `(unverified)` y `N/A`/`Unknown`); no `esc(name)` directo                                                                                                                                                                                                                            |
| P1-8 | `⋅` colgado no se limpia (solo `•`/`                                                               | `)                                                                                                                                                                                                                                                                                                                       | `ageSuffix` evita el caso; opcional regla `⋅` si se prefiere body literal |

### P2 — tarjeta completa de Rick (no en este spec)

- `1H` cambio/volumen, buys/sells, holders/top10, dev wallets, fresh %, socials, bundles, links de chart. Requiere datos que hoy no están en el compact path; se especifica aparte.
- `marketCap` (supply circulante) ausente en BSC; no aparece en el compact target.

---

## 4. Decisiones (con recomendación)

### D1 — Fuente de `SIM` (decisión owner)

**Recomendado:** usar el verdict de GoPlus (misma llamada que ya hacemos) para `sim`:

- Normalizar `is_honeypot`/`cannot_buy`/`cannot_sell_all`: aceptar `"0"|"1"` y `0|1`; cualquier otro valor/ausente → `null` para ese flag.
- `fail` si **cualquiera** es `1` (`is_honeypot`, `cannot_buy`, `cannot_sell_all`).
- `ok` **solo** si `is_honeypot` está presente y es `0`; los otros flags solo pueden forzar `fail` (no se exige que estén presentes). Si `is_honeypot` falta → `null` (no `ok`).
- `null` si el envelope es transiente/definitivo-ausente (nunca inventar).
- Documentar en AGENTS/CHANGELOG: **es un verdict de terceros (GoPlus), no una simulación local nuestra**. El label `SIM` se conserva para paridad visual; la procedencia queda escrita.
- Kill-switch `SNAPSHOT_SIM_VERDICT_ENABLED` (default `true`): apaga solo el `sim` (taxes y lock siguen); permite revertir el blast radius sin redeploy.

**Por qué:** KODA `404 pair not found` en honeypot.is; GoPlus sí responde y no agrega llamada. El objetivo `SIM: OK` se logra para KODA.

**Blast radius (medido 2026-10-22, dev `dexter_db` + staging `onchain_bot_dexter_staging`):** **ningún template ACTIVO usa `{{honeypotLine}}` ni `{{honeypotBlock}}`**. Activos staging: `bare-ca-v1` (bare), `full-dexter-v1` (ca, x), `compact-v1` (z), `chart-v1` (c), `chart-only-v1` (cc) — 0 hits. Dev además tiene `RickBurpBot` v15 (bare, `isActive=false`) como único portador de `{{honeypotLine}}`. Por tanto el cambio de `sim` es invisible hasta que se aplique el body nuevo (D10); el kill-switch sigue disponible por si el body se activa y se quiere apagar el `SIM` sin redeploy.

**Alternativa owner:** exigir una simulación real (honeypot.is). Entonces:

- Wire honeypot.is v2 como leg **fallback** (solo si GoPlus es transiente/ausente), timeout 1.5s, sin retries.
- Para KODA no habrá `SIM` (404) y el target no se cumple; sería honesto pero no paritario.
- No hacer honeypot.is el primario: es gratis y soporta BSC/Pancake, pero su índice no cubre tokens nuevos/chicos (KODA es la prueba).

### D2 — `⚠️` (low liquidity): **heurística nuestra**

`⚠️` si `liquidityUsdSide < 1_000` USD (equivale a total < 2_000). Evidencia Rick: `Liq: 1.8K ⚠️`, `Liq: 983` + `Low Liquidity`, `Liq: 7.9K [x3]` sin warning. El umbral exacto de Rick no está documentado; se declara como regla de display, no como dato. Constante `LOW_LIQUIDITY_SIDE_USD = 1_000` con test; el owner puede ajustarla.

### D3 — `🔒` (LP lock): **sí, con datos de GoPlus**

`🔒` si `lockedLiquidityPercent + burnedPercent >= 50` y al menos uno es numérico. Para KODA: PinkLock 99.9999% + null 0% = 100 → 🔒. Reglas:

- `percent` de GoPlus es fracción (0-1) → ×100, redondear a 4dp, clamp 0-100; no parseable → se omite la fila.
- `is_locked`: aceptar `1|"1"` = locked; `0|"0"` = no locked; cualquier otro valor = **no locked** (no “unknown locked”).
- `Null Address` (`0x000…000`) cuenta como **burned**, no locked (aunque GoPlus ponga `is_locked:1`).
- `lp_holders` vacío/ausente con `lp_holder_count` null/0 → ambos `null` (no data, no `0%`). Vacío con `lp_holder_count > 0` → también `null` (la API no devolvió filas; no afirmar 0).
- `lp_holders` top-N: un lock fuera del top-N puede dar **falso negativo**, nunca falso positivo; documentar.
- El lock es **token-level** (todos los pools); un lock en un pool secundario podría disparar 🔒 en el card del pool primario. El umbral 50% reduce pero no elimina el falso positivo; documentar como heurística.

### D4 — `Liq` one-side: **`liquidityUsd / 2`, display-only**

- Mantener el core `liquidityUsd` = total (invariante actual).
- Nuevo `liquidityUsdSide = liquidityUsd / 2` en dexter (derived, sin cambio de contrato).
- KODA: 787.253/2 = 393.6 → `394`; Rick 396. GoPlus one-side 392.4; diferencia de timestamp.
- No usar GoPlus `dex[].liquidity` en el renderer: acopla display a un campo de provider y agrega un caso de múltiples pools. Si el owner quiere exactitud one-side, se puede promover luego.

### D5 — Taxes: **mantener `2.97`**

No redondear a `3`. Rick redondea, pero `2.97%` es la medición; la paridad visual no justifica perder precisión. Si el owner prioriza el pixel, se agrega `honeypotLineCompact` después (no P0).

### D6 — `🌐`: **literal en el body**

El body nuevo usa `🌐` fijo en la línea de venue. Aplica a todas las chains (BSC target y Solana compact). Si se quiere por chain, se agrega una dimensión DisplayMap `venueIcon` en otro cambio.

### D7 — `headerIcon`: **nuevo derived**

`launchpadIconLink` si hay launchpad; si no, `chainDisplay`. BSC → 🟡; Solana pump → `[💊](url)`. Así el header conserva el icono de launchpad en Solana y gana el emoji de chain en BSC, sin condicionales en el body.

### D8 — `nameLink`: **P1, recomendado**

`[**Name**](botStartUrl)` si hay URL; `**Name**` si no. Evita `[Name]()`. **Debe reusar el mismo helper de `{{name}}`**: si la metadata es unverified, conserva el sufijo `(unverified)`; si el nombre está vacío, usa el mismo default que `{{name}}` (`N/A`/`Unknown`), no un `Unknown` distinto. Si el owner prefiere el body actual `[{{name}}]({{botStartUrl}})`, se deja; no bloquea BSC.

> **OWNER CORRECTION 2026-10-26:** vigente = texto PLANO `[Name](botStartUrl)` / `Name` (sin `**`). MarkdownV2 usa `*` simple para bold; `**Name**` se renderizaba literal (`**Dog In Pain**`) en el card. Para bold, componer en el body `[*{{name}}*]({{botStartUrl}})`.

### D9 — Blank line del 🍯: **`honeypotBlock`**

Nuevo derived `honeypotBlock` = `\n\n🍯 ${core}` (mismo `core` que `honeypotLine`). El body lo pone inline después de `Age`; cuando no hay fila, no deja newline. `honeypotLine` no se toca (compatibilidad con templates existentes).

### D10 — Estado del template

El row `RickBurpBot` es **operator-owned** (dev DB, `bare`, v15, inactivo). No se auto-seedea ni se sobreescribe. El body se aplica por el live editor (o SQL one-off) **después** del deploy del código; el preview debe listar los nuevos placeholders. No activar el template sin OK del owner.

---

## 5. Implementación (decision-complete)

### 5.1 Market-data — `apps/market-data`

**A. `src/snapshot/domain/snapshot-honeypot.ts`**

- `HoneypotReading` sigue `{buy, sell, sim}` (wire dexter intacto).
- `HoneypotProbe` variante `reading` gana `lpLock: LpLockReading | null`:
  ```ts
  export interface LpLockReading {
    readonly lockedPercent: number; // 0-100, Σ percent de holders locked (is_locked=1, address ≠ null)
    readonly burnedPercent: number; // 0-100, Σ percent de holders con null address
  }
  ```
  Regla de null (una sola): `lp_holders` ausente/vacío → `lpLock:null`; parseadas las filas, si NINGUNA trae `percent` parseable → `lpLock:null`; si al menos una lo trae → objeto con AMBOS números (`0` cuando ese bucket no aportó). `0` nunca significa “sin dato”. `percent` es fracción → ×100, redondeo 4dp, clamp 0-100. `is_locked` estricto (`1|"1"` = locked; `0|"0"`/ausente/otro = no locked); el null address cuenta como burned con independencia de `is_locked`.
- `resolveSimVerdictEnabled(...)` (nuevo, junto a `resolveHoneypotTimeoutMs`): lee `SNAPSHOT_SIM_VERDICT_ENABLED` (default ENABLED; false-ish desactiva). El servicio lo lee UNA vez en el ctor (`simVerdictEnabled`, mismo patrón que `honeypotTailMs`).
- `classifyTokenSecurity`:
  - `sim` con la matriz D1 (normalizar `"0"|"1"|0|1`; `is_honeypot` ausente → null; `cannot_buy`/`cannot_sell_all` solo fuerzan fail; `ok` SOLO con `is_honeypot` presente y 0).
  - `lpLock` con D3 (regla de null de arriba; taxes intactos con `parseTaxPercent`, `2.97` sin redondear).
  - Mantener la memoización de ausencias; no memoizar un reading con `lpLock:null` (sigue siendo un reading).
- `resolveHoneypot` (en `address-snapshot.service.ts`) **propaga `lpLock`** con este contrato exacto:
  ```ts
  private async resolveHoneypot(chainId, key, address): Promise<{
    readonly reading: HoneypotReading | null;
    readonly lpLock: LpLockReading | null;
    readonly transient: boolean;
  }>
  ```
  Salidas (todas): `goplus` ausente → `{reading:null, lpLock:null, transient:false}`; memo hit → idem; catch del adapter → `{reading:null, lpLock:null, transient:true}`; `probe.kind === 'reading'` → `{reading: simVerdictEnabled ? probe.reading : { ...probe.reading, sim: null }, lpLock: probe.lpLock, transient:false}` (el kill-switch apaga SOLO `sim`; taxes y lock sobreviven); `transient` → `{reading:null, lpLock:null, transient:true}`; ausencia definitiva (tras `memo.remember`) → `{reading:null, lpLock:null, transient:false}`.
  El slot del tail (L2227-2236) suma `let lpLock: LpLockReading | null = null;`, el cast del probe gana `readonly lpLock: LpLockReading | null`, y asigna `honeypot = probe?.reading ?? null; lpLock = probe?.lpLock ?? null; honeypotTransient = probe?.transient === true;`.
- Actualizar el comentario de módulo y `goplus.service.ts`: `sim` ya no es “siempre null”; `honeypot.is` queda fuera; la procedencia es GoPlus; el kill-switch `SNAPSHOT_SIM_VERDICT_ENABLED`.
- Tests: `snapshot-honeypot.spec.ts` (matriz sim, lock KODA, burned, vacío, vacío+count>0, malformado, taxes 0/2.97) + `address-snapshot-honeypot.spec.ts` (propagación `lpLock` al slot; `SNAPSHOT_SIM_VERDICT_ENABLED=false` → `sim:null` con taxes y lock intactos).
  - **Literales existentes que rompen por el campo requerido** (actualizar en el mismo commit): `snapshot-honeypot.spec.ts` **L123-126, 134-137, 142-145, 164-167, 236-239** y `goplus.service.spec.ts` **L40-43** (probe `reading` gana `lpLock`).
  - **Test obsoleto a reemplazar:** `snapshot-honeypot.spec.ts` **L148-157** (“siempre emite sim:null”) deja de ser cierto (`is_honeypot:'1'` → `fail`). Los fixtures que hoy esperan `sim:null` sobreviven solo si OMITEN `is_honeypot`; todo fixture nuevo que espere `sim:'ok'` (incluido CAKE en §5.1 C) debe traer `is_honeypot:'0'`.

**B. `src/snapshot/application/address-snapshot.service.ts`**

- **`pairCreatedAt` (fix real, cero llamadas extra):** `resolveVenue` ya llama `getTokenPools` + `selectPoolQuote`; `pick.poolCreatedAtMs` está disponible (GT `pool_created_at`, `geckoterminal.service.ts:528`). La línea 774 hardcodea `pairCreatedAtMs: null`. Cambiar a:
  ```ts
  pairCreatedAtMs: pick.poolCreatedAtMs ?? null,
  ```
  Actualizar el comentario stale del docstring de `resolveVenue` (**L693-700**), el comentario inline del return (**L770-771**) y el docstring de `resolveHoneypot` (**L570**, todavía dice `{reading, transient}`), todos dicen que el leg Gecko no trae creation time / no mencionan `lpLock`. **No** tocar `resolveDerivedChange24h`/`acquireDerivationCandles` (el “creation-only” era innecesario y agregaba una llamada). Nota de cobertura: L2303 ya lee `pairCreatedAtMs ?? derivedResolution.market?.poolCreatedAtMs ?? null` (todo 72), pero esa pata **no cubre KODA**: su `priceChange24h` nativo es no-null (`0`), así que la derivación hace early-return con `market: null` y `resolveVenue` es el único camino que lo arregla.
- **Lock merge (readonly, null-only):** `SnapshotQuote` es readonly; no hacer `quote.lockedLiquidityPercent ??=`. En el IIFE que construye `quote` (L2317-2366), insertar el objeto nuevo **antes** de `applyComputedFdv` y usarlo en el return:
  ```ts
  const merged: SnapshotQuote = venueFill.quote;
  const mergedWithLock: SnapshotQuote = {
    ...merged,
    lockedLiquidityPercent:
      merged.lockedLiquidityPercent ?? lpLock?.lockedPercent ?? null,
    burnedPercent: merged.burnedPercent ?? lpLock?.burnedPercent ?? null,
  };
  const sealed = applyComputedFdv(mergedWithLock); // ya existe en L2335
  ```
  El return final spread `...mergedWithLock` (no `...merged`) junto a `fdvUsd`/`marketCapUsd`/`fdvProvenance`. El `lpLock` viene del slot del tail (A). No pisar un valor real de otro provider (RugCheck sigue siendo Solana-only); `SNAPSHOT_QUOTE_FIELDS` ya incluye ambas columnas (`snapshot-quote.types.ts:56-57,107-108`), así que el merge normal las respeta y esto solo rellena nulls.
- Tests: `resolveVenue` con Gecko `pick.poolCreatedAtMs` → `pairCreatedAt` ISO, **espía `getTokenPools` una vez**; sin llamada extra a OHLC/Birdeye; `lpLock` merge null-only (no pisa un valor existente); `lpLock:null` → ambas columnas intactas (null); fallo del pool pick → null sin throw.

**C. `src/provider/infrastructure/goplus/goplus.service.ts`**

- Sin cambio de firma; el probe ahora trae `lpLock`/`sim` desde el classifier.
- Actualizar el contrato del comentario: GoPlus es también verdict de honeypot y lock; timeout/memo intactos.
- Test de servicio: body KODA → `reading.sim='ok'`, `lpLock={lockedPercent:100,burnedPercent:0}`; body CAKE (sin `lp_holders`) → `lpLock:null`, `sim:'ok'`.

**D. Contrato de respuesta**

- No cambia: `honeypot:{buy,sell,sim}` ya existe; `lockedLiquidityPercent`/`burnedPercent` ya existen en `AddressSnapshot`/controller; dexter ya los mapea (`market-data.client.ts:316-317`, `token-scan.pipeline.ts:354-355`).
- `sim` pasa a `'ok'|'fail'|null`; `toHoneypotOrNull` ya lo acepta.

### 5.2 Dexter — `apps/dexter-onchain-bot`

**A. `src/placeholders/domain/placeholder-registry.ts`**

Agregar a `DERIVED_PLACEHOLDERS`:

- `headerIcon`
- `liquidityUsdSide`
- `liquidityFlags`
- `honeypotBlock`
- `ageSuffix`
- `nameLink` (P1; si se aprueba D8)

No hay que tocar los whitelists por command: `buildPlaceholders()` compone base + derived para `ca|x|z|c|cc|bare` (auto-disponibles). Sí hay que insertar los nombres en el pin ORDENADO `placeholder-registry.spec.ts:44-69` (hoy `toEqual([...23 nombres])`), además de los counts.

**B. `src/placeholders/application/template-renderer.service.ts`**

- `headerIcon`: `launchpadIconLink` si `!= ''`, si no `chainDisplay` (raw, sin doble escape). Si AMBOS son `''` (chain sin DisplayMap y sin launchpad) el body deja un espacio líder antes de `{{nameLink}}`; aceptado (misma clase que el header viejo) — no inventar icono.
- `liquidityUsdSide`: `formatMoneyText(liquidityUsd/2)`; null → `N/A`; escapado una vez.
- `liquidityFlags` (un solo leading space, iconos adyacentes):
  ```ts
  const side = finite(liquidityUsd) ? liquidityUsd / 2 : null;
  const low = side !== null && side < 1_000;
  const locked = finite(lockedLiquidityPercent) ? lockedLiquidityPercent : null;
  const burned = finite(burnedPercent) ? burnedPercent : null;
  const hasLock = locked !== null || burned !== null;
  const lock = hasLock && (locked ?? 0) + (burned ?? 0) >= 50;
  const flags = `${low ? '⚠️' : ''}${lock ? '🔒' : ''}`;
  return flags === '' ? '' : ` ${flags}`;
  ```
  (raw emoji; sin escape). No existe helper `finite()` en el archivo — implementar con `Number.isFinite(...)` (el snippet es pseudocódigo). KODA → ` ⚠️🔒`; lock-only → ` 🔒`; low-only → ` ⚠️`; none → `''`. El snippet anterior pegaba `⚠️🔒` sin espacio en lock-only; este lo corrige.
- `honeypotBlock`: mismo `resolveHoneypotLineCore`; `core === '' ? '' : esc('\n\n🍯 ' + core)`.
- `ageSuffix`: `age = resolveValue('age')`; si `''` → `''`; si no `` ` ⋅ Age: \`${age}\`` `` (backticks estáticos, age ya escapado).
- `nameLink` (P1): reusar `this.resolveValue('name', values)` (default `N/A`, sufijo `(unverified)` incluido, escapado una vez); `botStartUrl` si existe → `[**${nameText}**](${url})`; si no → `**${nameText}**`. No `esc(name)` directo ni un default distinto.
- Tests en `template-renderer.service.spec.ts` + `template-renderer-fdv-ath.spec.ts` / `template-renderer-age.spec.ts` según el caso: cada key + body completo KODA.

**C. `src/scan/infrastructure/formatter/message-formatter.ts`**

- `formatCompactAgeText`: eliminar `if (days >= 7) ...w`; el rung de días cubre 1-29d:
  ```ts
  if (days >= 365) return `${Math.floor(days / 365)}y`;
  if (days >= 30) return `${Math.floor(days / 30)}mo`;
  if (minutes >= 24 * 60) return `${days}d`;
  ```
- Tests: `template-renderer-fdv-ath.spec.ts` (**L77-80** `ATH 5.6K (1w)` y **L144/151-153** tabla de edades) + `scan-card.spec.ts` (el método es `public static`; ahí viven los casos nuevos 6d/7d/13d/29d/30d/365d). Actualizar TODOS los pins `1w` existentes; no hay `message-formatter.spec.ts`.

**D. `src/placeholders/domain/venue-display.ts`**

- Agregar a `DEX_DISPLAY`: `pancakeswap_v2: 'Pancakeswap V2'` y `pancakeswap_v3: 'Pancakeswap V3'`. La key es el `dexId` (GT `pancakeswap_v2`; DexScreener `pancakeswap` + label `v2/v3`), no tocar `pancakeswap`.
- Test: `venueSuffixShort`/`venueLine` con `{dexId:'pancakeswap_v2', labels:[]}` → `Pancakeswap V2`; `pancakeswap` sigue `Pancakeswap`.

**E. Seed — `src/templates/infrastructure/seed/data/display-maps.seed.json`**

Agregar:

```json
{ "placeholderKey": "chain", "matchValue": "bsc", "display": "🟡" }
```

Evidencia: dev DB `dexter_display_maps` fila `chain/bsc/🟡`; no se agregan las otras chains (scope). El CLI ya hace dry-run/skip/drift; aplicar en staging con `--apply` tras el deploy. **Actualizar los pins del seed** `display-map-seed.service.spec.ts:96-102,110-116` (`created:2`/`skipped:2`/`toHaveLength(2)` → 3; el caso “exactly the two label rows” pasa a tres).

**F. `src/placeholders/api/http/placeholders.controller.ts`**

- Agregar las 6 keys nuevas a `PLACEHOLDER_META` (label/description/example) para que el editor las muestre con metadata.
- Actualizar los counts del docstring **`placeholders.controller.ts:179-180`** y los pins reales: 45/46 → **51/52** con D8 (o 50/51 sin D8) en `placeholder-registry.spec.ts:72-80` y `template-renderer-age.spec.ts:127-131`. OJO: `placeholders.controller.spec.ts:22,54` solo asserta `>=22`; no hay pin exacto ahí.

### 5.3 Template body (DB, no código)

Body nuevo para el row `bare/RickBurpBot` (v15 → v16), **sin activar**:

```text
{{headerIcon}} {{nameLink}} *[{{fdvUsd}}/{{priceChange24h}}] ${{symbol}}*
🌐 {{chainName}}{{venueSuffixShort}}
💰 USD: `{{priceUsd}}`
💎 FDV: `{{fdvUsd}}` ⇨ `{{fdvAth}}` [`{{fdvAthAgo}}`]
💦 Liq: `{{liquidityUsdSide}}`{{liquidityFlags}}
📊 Vol: `{{volume24hUsd}}`{{ageSuffix}}{{honeypotBlock}}
```

Si D8 no se aprueba, reemplazar `{{nameLink}}` por `[{{name}}]({{botStartUrl}})`. Si D9 no se aprueba, `{{honeypotBlock}}` → `{{honeypotLine}}` (sin blank line). Si D9 se aprueba pero `ageSuffix` no, `{{ageSuffix}}` → `⋅ Age:`{{age}}`` (y aceptar el colgado si age null).

**Orden de aplicación:** deploy de market-data + dexter y seed BSC → verificar preview con placeholders → actualizar el body → PATCH `refresh()` → capturar render. Aplicar el body antes del deploy lanza `UnknownPlaceholder`.

### 5.4 Documentación

- `apps/market-data/AGENTS.md` §HONEYPOT LEG: `sim` ya no siempre null (GoPlus verdict), `lp_holders` lock, null semantics, fresh-call budget, `pairCreatedAt` trigger.
- `apps/dexter-onchain-bot/AGENTS.md`: nuevos derived keys, body target, age formatter, thresholds.
- `apps/market-data/CHANGELOG.md` + `apps/dexter-onchain-bot/CHANGELOG.md` `[Unreleased]`.
- `docs/examples-for-dexter/rick-bot-scanner.md` no se toca (es corpus de Rick, no doc de implementación).

---

## 6. Tests / aceptación

### Unit (mínimo)

| App         | Archivo                                                                                                                              | Casos                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| market-data | `snapshot/domain/snapshot-honeypot.spec.ts`                                                                                          | sim ok/fail/null (incl. `is_honeypot` ausente, `cannot_*`); lock KODA 100/0; burned 100/0; `lp_holders` vacío → null; vacío + `lp_holder_count>0` → null; percent malformado; taxes 0/2.97 |
| market-data | `snapshot/application/address-snapshot*.spec.ts`                                                                                     | `resolveVenue` usa `pick.poolCreatedAtMs` (espía `getTokenPools` una vez, sin OHLC/Birdeye); fallo Gecko → null; lock merge null-only                                                      |
| market-data | `provider/infrastructure/goplus/goplus.service.spec.ts`                                                                              | body KODA (`is_honeypot:'0'`) → sim/lock; body sin `lp_holders` → null; actualizar literal `L40-43`                                                                                        |
| dexter      | `placeholders/application/template-renderer.service.spec.ts` + `template-renderer-fdv-ath.spec.ts` + `template-renderer-age.spec.ts` | `headerIcon`, `liquidityUsdSide`, `liquidityFlags` (4 combinaciones + lock-only), `honeypotBlock`, `ageSuffix`, `nameLink`, body completo                                                  |
| dexter      | `scan/infrastructure/formatter/scan-card.spec.ts` + `placeholders/application/template-renderer-fdv-ath.spec.ts:77-80,144,151-153`   | 6d/7d/13d/29d/30d/365d; pins `1w` existentes actualizados (no hay `message-formatter.spec.ts`)                                                                                             |
| dexter      | `templates/infrastructure/seed/display-map-seed.service.spec.ts:96-102,110-116`                                                      | seed 3 filas, bsc 🟡, counts 2→3, skip/drift existentes                                                                                                                                    |
| dexter      | `placeholders/domain/placeholder-registry.spec.ts` + `placeholders/api/http/placeholders.controller*.spec.ts`                        | counts 51/52 (o 50/51 sin D8); pin ORDENADO de nombres L44-69; META de las nuevas keys                                                                                                     |
| dexter      | `placeholders/domain/venue-display.spec.ts` (o el spec existente)                                                                    | `pancakeswap_v2` → `Pancakeswap V2`; `pancakeswap` intacto                                                                                                                                 |

### Aceptación live (staging/dev)

Con el snapshot KODA live, el render debe ser estructuralmente:

```
🟡 Koda [751/0%] $KODA
🌐 BNB @ Pancakeswap V2
💰 USD: `0.00007707`
💎 FDV: `751` ⇨ `2.5K` [`<d>`]
💦 Liq: `394` ⚠️🔒
📊 Vol: `2` ⋅ Age: `(7|8)d`

🍯 SIM: OK ⋅ T: 0/2.97
```

- Header: 🟡 (no vacío), venue: 🌐 + `@ Pancakeswap V2` (texto crudo; no `Pancakeswap\_v2`).
- `Liq` = total/2 (393.6→394), ⚠️ (side<1000), 🔒 (locked+burned≥50).
- `Age`: GT pool creation `2026-10-14T14:30:02Z`; el formatter floor da `7d` antes de las 14:30Z del 2026-10-22 y `8d` después. La aceptación debe aceptar `7d|8d`, no hardcodear `7d`; los unit tests injectan `nowMs`.
- `SIM: OK` + `T: 0/2.97`.
- `FDV/change/Vol/ATH` se aceptan con los valores honestos del snapshot, **no** los de Rick.
- `placeholdersUsed` incluye `headerIcon`, `venueSuffixShort`, `liquidityUsdSide`, `liquidityFlags`, `ageSuffix`, `honeypotBlock` (y `nameLink` si D8); counts 51/52 (o 50/51 sin D8).
- Fast-path cards no muestran SIM/lock (leg saltado); no es un fallo del compact path lento.
- Si GoPlus falla: sin `SIM`/`🔒`, `degraded`/`providerErrors` visibles; no inventar.

### Comandos

```bash
cd apps/market-data && npm test && npx tsc --noEmit
cd apps/dexter-onchain-bot && npm test && npx tsc --noEmit
cd apps/dexter-onchain-bot && npm run build
```

### Evidencia a guardar

- `.omo/evidence/rick-card-goplus-koda.json` (respuesta recortada, sin secretos).
- `.omo/evidence/rick-card-honeypot-is-koda.txt` (404) y CAKE 200.
- `.omo/evidence/rick-card-render.txt` (texto exacto + `placeholdersUsed`).
- `.omo/evidence/rick-card-tests.log` (suites/tests counts).

---

## 7. Rollout

1. Rama `feat/rick-compact-card` desde `dev`; commits por app (market-data, dexter, docs).
2. Tests + `tsc` + build; inventario de templates activos (2026-10-22: **0** usan `{{honeypotLine}}`; el blast radius de `SIM` empieza con el body nuevo, gate D10); PR a `dev`; deploy staging automático (market-data/dexter).
3. Seed DisplayMaps: dry-run (`rows=3 wouldCreate=1`) → `--apply` → re-run `created=0 skipped=3`.
4. Verificar snapshot staging: `pairCreatedAt` (ISO), `lockedLiquidityPercent`, `burnedPercent`, `honeypot.sim`, `venue.dexId=pancakeswap_v2`.
5. Aplicar body al row `RickBurpBot` en el entorno de preview; PATCH `refresh()`.
6. Capturar render + `placeholdersUsed`; comparar contra el target.
7. **No** tocar `master`/prod; no dispatch de deploy prod; `origin/master` debe seguir `9f1acd80`.

**Rollback:** primero **desactivar/restaurar el body v15** (el código viejo no conoce `{{headerIcon}}`, `{{honeypotBlock}}`, etc. y lanzaría `UnknownPlaceholder`), después revertir la imagen de dexter/market-data al tag anterior. Los campos nuevos son aditivos; el cambio de age `1w`→`7d` es global (visible en todos los cards) y se revierte con el formatter.

---

## 8. Riesgos y mitigaciones

| Riesgo                                                              | Mitigación                                                                                                                                                           |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| GoPlus `is_honeypot` es un verdict de terceros, no simulación local | Documentar procedencia; `SIM` solo con verdict definitivo; null en transiente. Si el owner exige sim real, usar honeypot.is fallback y aceptar que KODA no tenga SIM |
| `lp_holders` top-N puede omitir un lock                             | Falso negativo, nunca falso positivo; badge ≥50%; documentar                                                                                                         |
| `liquidityUsd/2` aproxima one-side                                  | Es exacto para AMM balanceado al precio marginal; documentar; GoPlus 392.4 vs 393.6 vs Rick 396                                                                      |
| `⚠️` threshold es heurística                                        | Constante documentada; ajustable por owner; no es un claim de seguridad                                                                                              |
| `pairCreatedAt` fix de una línea; cero llamadas extra               | `resolveVenue` ya fetchea el pool; solo se usa `pick.poolCreatedAtMs`; si el pick falla, Age null (honesto)                                                          |
| Lock token-level puede disparar 🔒 en el pool equivocado            | Falso positivo posible; umbral ≥50%; documentar como heurística; no claim de seguridad                                                                               |
| `sim` flip agrega `SIM: OK` a templates activos                     | Inventario + `SNAPSHOT_SIM_VERDICT_ENABLED` + staging; docs                                                                                                          |
| Fast-path omite SIM/lock/pairCreatedAt                              | Documentar; no forzar el leg; el target es el compact path lento                                                                                                     |
| Body aplicado antes del deploy → `UnknownPlaceholder`               | Orden estricto: código+seed primero, body después; preview valida; rollback desactiva el body antes de la imagen                                                     |
| Cambio global de age `1w`→`7d`                                      | Aceptado por el owner; tests pin; rollback con la imagen                                                                                                             |
| Age puede ser `8d` (no `7d`) según hora                             | Aceptar `7d                                                                                                                                                          | 8d`; tests con `nowMs`; no hardcodear |
| Números de Rick no coinciden                                        | No falsificar; documentar provider/timestamp; el acceptance es estructural                                                                                           |

---

## 9. Decisiones abiertas para el owner

1. **D1 — SIM**: ¿GoPlus verdict (recomendado; KODA tendrá `SIM: OK`) o solo simulación real honeypot.is (KODA quedará sin SIM por 404)?
2. **D2 — ⚠️**: ¿umbral one-side `$1,000` (recomendado) u otro?
3. **D4 — Liq one-side**: ¿`liquidityUsd / 2` display-only (recomendado) o mantener total + `[x1]`?
4. **D5 — Tax**: ¿mantener `0/2.97` (recomendado) o redondear a `0/3`?
5. **D6 — 🌐**: ¿literal para todas las chains (recomendado) o icono por chain vía DisplayMap?
6. **D8 — `nameLink`**: ¿agregar P1 (recomendado) o dejar `[{{name}}]({{botStartUrl}})`?

Con OK a **D1/D2/D4/D5/D6/D8** el spec queda decision-complete. **D3** (🔒 GoPlus) y **D7** (`headerIcon`) son las recomendaciones que implementan P0-7/P0-1 — van en el mismo cambio y no requieren ratificación separada; **D9** (`honeypotBlock`, P1) tampoco bloquea. **D10** es estado operativo: el body no se activa sin OK explícito.

---

## 10. `👥 TH:` — holders top-5 (PLAN ONLY — cero código, cero body, cero activación)

> **Estado (2026-10-26):** documentado y decidido a nivel de contrato; **NO implementado**. Este bloque fija la evidencia documental, separa lo documentado de lo NO documentado, enumera las decisiones de producto que SOLO el owner puede tomar, y deja el contrato de datos/render listo para una lane posterior. **Regla dura:** nada de `apps/market-data` ni `apps/dexter-onchain-bot` toca este spec hasta que el owner firme §10.11; ninguna template se edita (`RickBurpBot` sigue en **v20**, `isActive=false`).

### 10.1 Evidencia documental (Rick)

Fuentes leídas 2026-10-26 (el sufijo `.md` da markdown limpio):

- `https://docs.rick.bot/features/pricebot#reading-a-token-scan` — definición de la línea.
- `https://docs.rick.bot/features/top-holders#holder-stats` — vista `/hs` (`T10`/`T20`). Es **otra vista**: su redacción sobre excluir pools **no** se asume para `TH`.

Cita literal (pricebot):

> `👥 TH: 4.2⋅3.1⋅2.0 [42%]` - top 5 holders' percentages, then the top 10 total. The creator's share is bold.

Hallazgos colaterales (verificados, no inferidos):

- El corpus de docs (~52k palabras) NO describe sistema de placeholders/templates: `{{` = **0 hits**. `TH` es una línea fija del card, no authorable.
- Las páginas no llevan versión ni `last updated`.
- En el contexto NFT del mismo sitio, `TH` = _total holders_ — homónimo; no confundir en nuestros docs.

### 10.2 Documentado vs NO documentado

| Aspecto               | ¿Documentado? | Qué dice                                                                  |
| --------------------- | ------------- | ------------------------------------------------------------------------- |
| Forma                 | Sí            | 5 valores separados por `⋅`, luego `[N%]`                                 |
| Numerador de los 5    | Sí            | porcentaje de cada holder                                                 |
| Numerador del bracket | Sí            | "the top 10 total" (**total de los 10**, NO la suma de los 5)             |
| Bold                  | Sí            | "the creator's share is bold"                                             |
| Redondeo              | **No**        | el ejemplo muestra 1 decimal (`2.0`) y bracket entero (`42%`)             |
| Denominador           | **No**        | supply total vs circulante — no dicho                                     |
| Exclusiones           | **No**        | pools, burn, LP-locked, dev, exchanges… silencio total                    |
| <5 holders            | **No**        | el ejemplo muestra 3 valores con prosa que dice 5 → ¿truncado? ¿variable? |
| Creator share         | **No**        | no dice cómo se identifica al creator                                     |

Chequeo aritmético del sample del owner (`👥 TH: 2.4⋅1.3⋅1.2⋅1.2⋅1.2 [12%]`): 2.4+1.3+1.2+1.2+1.2 = **7.3%** mostrado vs **12%** de bracket → los ranks 6–10 aportan ~**4.7%**. Confirma que el bracket NO es la suma de los 5.

### 10.3 Realidad de datos hoy (código verificado)

- `SnapshotQuote` expone SOLO `holders` (conteo, de agregadores) y `top10HolderPercent` (`snapshot-quote.types.ts` L133-134). **No existe** array por-wallet.
- `top10HolderPercent` lo calcula el fetcher `solana-rpc` (`provider-quote.fetchers.ts` L701-726): `getTokenSupply` + `getTokenLargestAccounts`, suma `largest.slice(0,10)`, **descarta direcciones**, `?? 0` por entrada, **sin exclusiones** y con denominador = supply total. Incluye vaults de pool/curva → está inflado por diseño.
- `TokenAccountEntry` (`solana-rpc.types.ts` L13-19) trae `address` + montos, **no** el owner. `getTokenLargestAccounts` devuelve CUENTAS DE TOKEN (ATAs), no wallets.
- Para pasar de ATA a wallet hay que leer el data de la cuenta: layout SPL 165B — `mint[0..32]`, `owner[32..64]`, `amount[64..72]`. `SolanaAccountInfoValue` (L36-43) trae `data: [base64,'base64']` + `owner` — y ese `owner` es el **programa dueño de la CUENTA** (Token Program), **no** el holder. Confundirlos es el error clásico.
- Ya existe el transporte batcheado: `getMultipleAccounts(addresses)` (`solana-rpc.service.ts` L270: chunks ≤100 en UNA ronda paralela, `null` por cuenta, nunca throw) + alias congelado `getMultiple` (L295, `BatchAccountsClient` L69-72 — **no renombrar**).
- **No hay fuente EVM keyless por-wallet:** Etherscan `tokenholderlist` es PRO; BSC no tiene Blockscout (RESEARCH-49); Moralis/Birdeye requieren key (Moralis pausado). → **La fila TH v1 es SOLANA-ONLY. En BSC (KODA) queda en silencio.** Es el hallazgo más importante para el owner: el token flagship del compact card NO puede mostrar TH con datos gratis.

### 10.4 Coste y deadline (si se implementa)

- **+2 llamadas RPC** por snapshot Solana frío: (1) batch de los ≤20 ATAs → decode del owner; (2) batch de las ≤20 wallets → clasificar System-owned vs program-owned. Secuenciales (la 2ª depende del decode); chunk ≤100 → 1 llamada cada una.
- Ese coste entra en el fetcher `solana-rpc`, que hoy paga **1 token** del bucket `outbound:solana-rpc` y camina tiers (Helius → Shyft → Chainstack → público rotativo). El retry wrapper NO cubre `solana-rpc` (nunca throw) → los 2 calls extra heredan el walk + fail-open.
- **Riesgo de deadline:** el fan-out abandona el fetcher completo a `SNAPSHOT_FANOUT_DEADLINE_MS` (4000ms). 3 round trips en serie con RPC público (~200-400ms c/u) entran; en un día 429-walled se pierde `totalSupply`/`top10HolderPercent` que HOY se sirven. Alternativa evaluada y **descartada**: tail-extra (repetiría `getTokenLargestAccounts` = 1 llamada extra + un segundo writer).
- Presupuesto público: 40 req/10s por IP; +2 por cold con la cadencia actual (~2 cold/min) es ruido, pero el soak debe medirlo.

### 10.5 Contrato de datos — dos opciones

**Opción A (recomendada) — objeto coherente, un solo writer**

```ts
/** Solana-only. `topPercents` DESCENDENTE, 1..5 entradas. `top10Percent`
 *  suma los top-10 CUENTAS-MERGEADAS-A-WALLET bajo el MISMO denominador
 *  y las MISMAS exclusiones, así que `sum(topPercents) <= top10Percent`
 *  es invariante (assertable en spec). */
export interface HolderConcentration {
  readonly topPercents: ReadonlyArray<number>;
  readonly top10Percent: number;
}
```

- `SnapshotQuote.holderConcentration?: HolderConcentration | null`
- **Obligatorio** añadirlo a `SNAPSHOT_QUOTE_FIELDS` (L120-144) **y** a `emptySnapshotQuote()` (L146+) como `null` — lección todo-72: el merge copia SOLO campos listados (un campo fuera de la lista nunca llega al quote mergeado) y el empty debe declararlo.
- `top10HolderPercent` legacy (`{{top10HolderPercent}}`) **NO se toca** (sigue pool-inclusivo) y se documenta como **métrica distinta**. **Regla:** un body no puede mezclar ambos en el mismo card (dos "top 10" distintos sería deshonesto).

**Opción B (descartada) — dos campos sueltos** (`topHolderPercents` + `top10HolderPercentExcludingPools`): misma información, dos writers/validadas independientes → invita a drift y a media fila. Rechazada por el mismo motivo por el que `market1hRow` es UNA key compuesta.

### 10.6 Política de cálculo (borrador v1 — requiere OK, ver §10.11)

Cada punto es una **decisión de producto**, no una inferencia de los docs:

1. **Denominador = supply TOTAL** (`getTokenSupply`). Es el único on-chain; el circulante es reportado por agregadores y suele faltar; un denominador mixto rompería `sum ≤ top10`.
2. **Merge por wallet** (sumar ATAs del mismo owner, re-ordenar). Sin merge se renderizan cuentas, no holders — divergencia de fidelidad.
3. **Exclusiones v1 (solo dos, ambas verificables):**
   - owner == `11111111111111111111111111111111` (System Program, sink de burn canónico) → excluido.
   - wallet **program-owned** (el `owner` de la cuenta wallet ≠ System Program) → excluido: captura pool/curva/PDA/vault. **Coste aceptado:** también cae una wallet multisig (Squads) → falso NEGATIVO, nunca falso positivo.
   - Se descarta excluir por lista de marcas/CEX: no hay fuente keyless → sería invención.
4. **< 5 wallets:** renderizar las que haya (1..5). El ejemplo de docs muestra 3 → lista variable es plausible; **nunca** padding. `0` wallets → silencio total.
5. **Redondeo:** cada valor `toFixed(1)` **conservando el cero** (`2.0`, no `2`) porque el único sample documentado muestra `2.0`; bracket `Math.round` a entero (`42%`). `formatPercentText` NO sirve para los 5 (trimmea y pierde el `.0`); `formatMoneyText` tampoco.
6. **Creator bold: OUT de v1.** Requiere resolver la wallet del creator (no existe hoy) + cambiar la composición de "escapar una vez" a "escapar cada valor y componer con `*` crudo" (MarkdownV2 bold = UN `*`; `**` se renderiza literal — lección `nameLink`).
7. **Cota honesta:** `getTokenLargestAccounts` devuelve ≤20 cuentas, así que el top-10 post-merge es un **lower bound** del top-10 real de wallets, nunca un sobrestatement.

### 10.7 Renderer (dexter) — una sola key compuesta

Precedente exacto: `market1hRow` (`template-renderer.service.ts` L659-692).

- Key: **`holderTopRow`** en TODOS los comandos (`ca|x|z|bare`, + `c|cc` con timeframe) → registry **22 base + 31 derived = 53** (`54` para `c|cc`); `PLACEHOLDER_META` gana `{type:'derived', nullable:true, example:'👥 TH: 4.2⋅3.1⋅2.0 [42%]'}`.
- Valor: `""` (silencio) o `"\n👥 TH: " + <payload>` — mecánica **sufijo** idéntica a `honeypotLine` (`"\n🍯 " + core`), para que el silencio no deje una etiqueta colgada (`👥 TH:` sin payload) ni una línea en blanco. `cleanupDanglingSeparators` **NO** se toca (sus reglas son brackets/backticks/`⇨` con guards anti-link delicados; añadir una familia nueva es riesgo global innecesario).
- Payload: `p1⋅p2⋅…⋅pN [M%]` con UN espacio antes del bracket (sample de docs).
- Silencio (`""`) si: `holderConcentration` ausente/null/malformado; `topPercents` vacío o >5; cualquier valor no finito o fuera de 0-100; `top10Percent` no finito/fuera de 0-100; `sum(topPercents) > top10Percent + ε` (incoherencia → silencio, nunca una fila mentirosa). **Nunca `N/A`, nunca media fila** (misma regla que `market1hRow`).
- Escapado: componer crudo y `esc` UNA vez. `esc` = `escapeV2Text` → `MessageFormatterAdapter.escapeV2` (`message-formatter.ts` L348-351), set `[_*[\]()~`>#+=|{}.!\\-]`. Pinneado: `2.0`→`2\.0`(Telegram muestra`2.0`); `[42%]`→`\[42%\]`(muestra`[42%]`); `⋅`y`%` no se tocan. **NUNCA** escapar dos veces.
- Cliente/pipeline: guard `toHolderConcentrationOrNull` en `market-data.client.ts` (patrón `toVenueOrNull`/`toHoneypotOrNull`, L80+) → rechaza arrays malformados, >5 entradas, no finitos, fuera de rango y `sum > top10`; `ResolvedToken.holderConcentration?: … | null` (opcional para no romper los literales existentes); re-validación en `toResolvedToken` (doble validación, precedente `honeypot`/`venue`).
- **Línea legacy** `👥 Holders` de `message-formatter.ts` (~L325, card legacy `formatScanCard`): NO se toca.

### 10.8 Body (v21) — NO aplicar en esta lane

El body vivo es v20 (`RickBurpBot`, `isActive=false`) con `{{market1hRow}}{{honeypotBlock}}` en la misma línea. Cambio propuesto (v21), **solo tras OK del owner**:

`…{{ageSuffix}}{{market1hRow}}{{holderTopRow}}{{honeypotBlock}}`

Requisitos verificables al aplicarlo (**leer la fila viva ANTES**, no asumir):

- `holderTopRow` provee su `\n`; el 🍯 sigue proveyendo `\n\n`. Resultado: `1H` (si existe) → `👥 TH` (si existe) → línea en blanco → `🍯` (si existe).
- Con `market1hRow` en silencio **no** debe quedar línea en blanco entre `Age` y `TH`; el body no debe aportar un `\n` propio delante de `{{market1hRow}}`. Si el v20 vivo lo tiene, se ajusta en el mismo edit (una sola operación, preview antes/después).
- El orden final de la línea (¿`TH` antes o después de `1H`?) es **decisión de body del owner**, no de código.

### 10.9 Tests failing-first (cuando se implemente)

**market-data**

- `address-snapshot-holder-concentration.spec.ts` — decode ATA (mint/owner/amount), merge por wallet, orden descendente, exclusión burn, exclusión program-owned, denominador supply total, <5 y 0, `sum ≤ top10`, fail-open (batch null / supply null / 0 wallets), call-count (exactamente 2 batches, chunks ≤100).
- `provider-quote-holder-concentration.spec.ts` — el fetcher emite el objeto; sin supply → `null` y **cero** llamadas extra; campo presente en `SNAPSHOT_QUOTE_FIELDS` + `emptySnapshotQuote()`.

**dexter**

- `template-renderer-holder-top-row.spec.ts` — matriz completa: 5/3/1 valores, 0 → `""`, objeto null → `""`, >5 → `""`, no finito/rango → `""`, `sum > top10` → `""`, formato `2.0` (cero conservado) + bracket entero, escapado simple (`2\.0`, `\[42%\]`), sin `N/A`, prefijo `\n👥 TH: ` exacto, catálogo/META, counts 53/54.
- `market-data-client-holder-concentration.spec.ts` — guard (arrays malformados, >5, fuera de rango, `sum > top10`, strings, ausente).
- `token-scan-holder-concentration.spec.ts` — passthrough + re-validación del pipeline.
- Pins de conteo en los specs de registry/rick-card existentes (52→53, 53→54).

### 10.10 Docs a actualizar (cuando se implemente)

- `apps/market-data/AGENTS.md` — sección nueva `HOLDER CONCENTRATION (TH)`: contrato, política (denominador/exclusiones/lower-bound), coste (+2 RPC), cadena (Solana-only), fail-open.
- `apps/dexter-onchain-bot/AGENTS.md` — registry 53/54, la key derivada, mecánica sufijo, reglas de silencio y de escapado, referencia a este §10.
- `docs/deployment/market-data-staging-soak.md` — contadores nuevos: tasa de `holderConcentration: null` en Solana y latencia del fetcher (para ver el deadline).
- Este plan: al implementarse, mover §10.11 a "resueltas" con la decisión firmada.

### 10.11 Decisiones abiertas para el owner (TH) — BLOQUEAN toda implementación

1. **F1 — Alcance:** ¿aceptamos que TH sea **Solana-only** (KODA/BSC en silencio), o el owner abre una fuente keyed (Moralis/Birdeye/Covalent) rompiendo "free-forever"?
2. **F2 — Denominador:** supply total (recomendado) vs circulante reportado.
3. **F3 — Exclusiones:** (a) ninguna; (b) burn + program-owned (recomendado); (c) además lista curada de pools/CEX (necesita fuente, hoy inexistente).
4. **F4 — <5 wallets:** renderizar 1..5 (recomendado; el sample de docs muestra 3) vs exigir exactamente 5 o silencio.
5. **F5 — Redondeo/bracket:** 1dp con cero conservado + bracket `Math.round` (recomendado) vs `Math.floor` vs trim.
6. **F6 — Creator bold:** fuera de v1 (recomendado) vs incluirlo (requiere resolución de la wallet del creator + composición con `*` crudo).
7. **F7 — Orden en el card y composición del body v21** (¿TH antes o después de 1H?), con la regla de "sin línea en blanco" de §10.8.

**Gate:** sin F1-F7 firmadas NO se escribe código, NO se edita el body, NO se activa nada. `RickBurpBot` sigue en v20 `isActive=false`.

### 10.12 Riesgos

| Riesgo                                                              | Mitigación                                                                                                                                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lista dominada por el vault del pool/curva → fila engañosa          | F3(b): excluir program-owned + burn; si el owner elige (a), el silencio es preferible a una fila falsa                                                                |
| Excluir program-owned tira wallets multisig                         | Falso NEGATIVO aceptado y documentado (Squads); nunca falso positivo                                                                                                  |
| Top-10 es lower bound (ventana de 20 cuentas)                       | Documentado; nunca sobrestatement                                                                                                                                     |
| Token-2022                                                          | Decodificar SOLO si `account.owner` es `Tokenkeg…`/`Tokenz…`; base 165B (mint/owner/amount) idéntica; extensiones ignoradas → fail-open `null` si el layout no cuadra |
| +2 RPC en el fetcher puede costar `totalSupply`/`top10` en días 429 | Deadline 4s + fail-open; el soak mide; si degrada, se mueve a tail-extra con presupuesto propio (coste: repetir `getTokenLargestAccounts`)                            |
| Dos "top 10" distintos en el mismo card                             | Regla: un body no mezcla `holderConcentration.top10Percent` con `{{top10HolderPercent}}`                                                                              |
| `[N%]` con exclusiones no comparable con Rick                       | Los docs de Rick NO documentan exclusiones → no reclamamos paridad, solo estructura                                                                                   |
| Fila colgada si el body aporta un `\n` extra                        | §10.8 exige leer la fila viva antes del edit + preview antes/después                                                                                                  |
