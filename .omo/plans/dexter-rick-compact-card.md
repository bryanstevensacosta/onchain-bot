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
