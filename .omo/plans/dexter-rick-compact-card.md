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

Body nuevo para el row `bare/RickBurpBot` (v15 → v16), **sin activar**. ⚠️ Corregido el 2026-10-30 tras la review adversarial: la versión anterior de este bloque tenía `*[{{fdvUsd}}/{{priceChange24h}}]*` con corchetes CRUDOS (MarkdownV2 reservado ⇒ 400 en el primer envío, para todo token) y envolvía placeholders crudos en backticks (`` `{{priceUsd}}` `` imprime `0\.00007707`: el valor se escapa con `escapeV2Text` y el backslash se ve dentro del code entity). Este es el body BASE, correcto pero NO monoespaciado en esas filas; el body recomendado final es el v17 de §10.15.

```text
{{headerIcon}} {{nameLink}} *\[{{fdvUsd}}/{{priceChange24h}}\] ${{symbol}}*
🌐 {{chainName}}{{venueSuffixShort}}
💰 USD: {{priceUsd}}
💎 FDV: {{fdvUsd}} ⇨ {{fdvAth}} \[{{fdvAthAgo}}\]
💦 Liq: {{liquidityUsdSide}}{{liquidityFlags}}
📊 Vol: {{volume24hUsd}}{{ageSuffix}}{{honeypotBlock}}
```

Corchetes: son texto ESTÁTICO del body, por eso van escapados a mano (`\[`, `\]`). Los corchetes de una key compuesta (`fdvChangeBracket`, `holderTopRow`) los escapa la KEY — nunca ambos lados.

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

## 10. `👥 TH:` — holders top-5 (CÓDIGO IMPLEMENTADO 2026-10-26 — body y activación siguen pendientes)

> **Estado (2026-10-26, tras revisión adversarial doble + implementación):** contrato **implementado en código** (commit `c6e9245b`, deploys de staging verdes — §10.13). El **body de template NO se tocó** y **`RickBurpBot` sigue inactivo**: esas dos cosas siguen necesitando un OK explícito del owner. El owner dijo "procede con la implementacion" el 2026-10-26; se interpretó como **ratificación de las 8 recomendaciones** de §10.11 (F1/F2/F3/F4/F5/F6/F8/F9) — la interpretación queda escrita aquí para que sea auditable y reversible. Ninguna template se edita: el body vivo es operator-owned y NO está en git; el plan lo cita como **v15** (§2/P0-11) y el operador lo reporta como **v20**. Antes de tocarlo hay que LEERLO (versión + body + `isActive`).

### 10.0 Checklist de precondiciones (review adversarial 1 + delta 2026-10-26)

Ninguna es una decisión de producto: son contratos/bugs existentes que, sin resolver, hacen que TH sea un no-op o rompan el build.

| #   | Precondición                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Dónde                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| C1  | **`MergeAcc` no acepta objetos.** Falla `tsc` en el spread `{ ...emptySnapshotQuote() }` (L191) y en el cast `merged as SnapshotQuote` (L213); el loop (L199-206) castea a `Record<string, unknown>` y **sí** asignaría en runtime. Fix: ensanchar el mapped type con la unión **concreta** `\| HolderConcentration` (`Record<string, unknown>` NO sirve: las interfaces sin index signature no son asignables).                                                                             | `snapshot-aggregator.service.ts:184-213`                                                     |
| C2  | **`TOKEN_2022_PROGRAM` tiene un typo** (`…PHnAAvKmd1qT6M` vs el canónico `…PHnBqCXEpPxuEb`), pero **no es precondición**: solo lo consume el re-export `onchain/index.ts:11` (sin uso runtime), ningún spec pinnea la constante y `decodeTokenAccount` es **program-agnóstico** (valida longitud, no programa). **Decisión: NO gatear por program id.** Limpieza opcional en el mismo commit: constante + el literal mock de `onchain-solana.reader.spec.ts:293`; el fixture ya es canónico. | `solana-program-ids.ts:73`, `solana-mainnet.fixtures.ts:84`, `token-accounts.codec.ts:34-52` |
| C3  | **El edge compat es un whitelist explícito** (nunca spread): sin la clave nueva, el campo no llega a dexter. Batch sigue reducido (como `venue`/`launchpad`/`fdvAth`).                                                                                                                                                                                                                                                                                                                       | `market-data-snapshot.controller.ts:55-103`, `addresses-batch.controller.ts:110-124`         |
| C4  | **El fast path nunca produce el objeto** (`...emptySnapshotQuote()` en su quote) y corre en vez del fan-out. Sin F8, los tokens calientes jamás muestran TH.                                                                                                                                                                                                                                                                                                                                 | `direct-fast-path.service.ts:500-520`, `address-snapshot.service.ts:1470-1498`               |
| C5  | **No meterlo dentro del fetcher `solana-rpc`:** `callRpc` camina tiers en serie con timeout de **10 s por tier** y el fan-out abandona el fetcher COMPLETO a 4000 ms → se perderían `totalSupply`/`top10HolderPercent` que hoy se sirven. Diseño corregido en §10.4.                                                                                                                                                                                                                         | `solana-rpc.service.ts:302-345`, `snapshot-aggregator.service.ts:100-155`                    |
| C6  | **Reusar el decoder existente** (`decodeTokenAccount`, `TOKEN_ACCOUNT_MIN_LEN = 165`, `isUninitializedTokenAccount`), no re-especificar el layout a mano.                                                                                                                                                                                                                                                                                                                                    | `token-accounts.codec.ts:25`, `:34-52`, `:184-186`; exports `onchain/index.ts:56,61`         |
| C7  | **Un solo `ε`** para el guard `sum(top5) ≤ top10`, idéntico en las dos apps, y coherencia de display (el bracket no puede quedar por debajo de la suma mostrada). §10.6/§10.7.                                                                                                                                                                                                                                                                                                               | cliente + renderer                                                                           |
| C8  | **El body nuevo debe ELIMINAR `{{top10HolderPercent}}`** si el body vivo lo trae (la semilla `FULL_DEXTER_BODY` lo usa). Dos "top 10" distintos en el mismo card es exactamente lo prohibido.                                                                                                                                                                                                                                                                                                | `message-template-seed.service.ts:45`, §10.8                                                 |
| C9  | **`PLACEHOLDER_META` no tiene enforcement**: sin entrada cae a `{type:'string', nullable:true, example:''}` sin fallar. Añadir el spec que itera todos los comandos.                                                                                                                                                                                                                                                                                                                         | `placeholders.controller.ts:24`, `:250`                                                      |

### 10.1 Evidencia

**(a) Docs oficiales** (leídos 2026-10-26; el sufijo `.md` da markdown limpio):

- `https://docs.rick.bot/features/pricebot#reading-a-token-scan` — definición de la línea.
- `https://docs.rick.bot/features/top-holders#holder-stats` — vista `/hs` (`T10`/`T20`). Es **otra vista**: su redacción sobre excluir pools **no** se asume para `TH`.

> `👥 TH: 4.2⋅3.1⋅2.0 [42%]` - top 5 holders' percentages, then the top 10 total. The creator's share is bold.

**(b) Captura real en repo — AUTORITATIVA para la forma** (`.md`, no inferencia): `docs/examples-for-dexter/rick-bot-scanner.md:57` (repetida en `:202`, `:348`, `:458`). De los 40 bloques capturados, **4/4 cards del emisor `6126376117` (Rick) traen TH**; los otros 36 bloques son de otros bots y no traen ninguno. Layout exacto:

```
📊 Vol: 2.4K ⋅ Age: 6d
📉 1H: 0 ⋅ -0.7% 🅑 0 Ⓢ 0
                              ← línea en blanco
👥 TH: 4.3⋅3.3⋅2.8⋅2.3⋅1.8 [20%]
🤝 Total: 62 ⋅ avg 4w old
🌱 Fresh 1D: 10% ⋅ 7D: 27%
```

Conclusiones pinneadas:

- TH va **DESPUÉS** de la fila 1H y **separada por una línea en blanco** (bloque propio de holder-stats, seguido de `🤝 Total` / `🌱 Fresh`). Esto cierra el orden que §10.8 dejaba abierto.
- **5 valores**, 1 decimal, `⋅` como separador, bracket entero con un espacio antes: `4.3⋅3.3⋅2.8⋅2.3⋅1.8 [20%]`.
- Aritmética: 4.3+3.3+2.8+2.3+1.8 = **14.5** mostrado vs bracket **20** → ranks 6–10 ≈ **5.5%**. El bracket NO es la suma de los 5 (igual que en el sample del owner: 2.4+1.3+1.2+1.2+1.2 = 7.3 vs 12).
- El card capturado es **`🌐 Robinhood @ Uniswap V4`** → Rick renderiza TH en **EVM**. Nosotros NO tenemos fuente EVM keyless por-wallet (§10.3), así que en BSC/KODA la fila quedará en **silencio** mientras Rick la muestra. **Paridad declarada como imposible con datos gratis; jamás se rellena.**
- El corpus de docs (~52k palabras) NO describe sistema de placeholders/templates (`{{` = 0 hits): `TH` es línea fija del card, no authorable. Las páginas no llevan versión ni `last updated`. En el contexto NFT del mismo sitio `TH` = _total holders_ (homónimo).
- **Evidencia externa no vendorizada**: estos datos se capturaron en vivo el 2026-10-26 pero no hay corpus ni log en `.omo/evidence`. Antes de implementar, re-verificar con UNA lectura de las dos URLs (no cambiar el contrato si cambió la forma).

### 10.2 Documentado vs NO documentado

| Aspecto               | ¿Documentado? | Qué dice                                                                         |
| --------------------- | ------------- | -------------------------------------------------------------------------------- |
| Forma                 | Sí            | 5 valores separados por `⋅`, luego `[N%]` (confirmado en captura)                |
| Numerador de los 5    | Sí            | porcentaje de cada holder                                                        |
| Numerador del bracket | Sí            | "the top 10 total" (**total de los 10**, NO la suma de los 5)                    |
| Bold                  | Sí            | "the creator's share is bold"                                                    |
| Separación            | Sí (captura)  | línea en blanco antes del bloque TH, después de `1H`                             |
| Redondeo              | **No**        | docs muestran 3 valores/`2.0`; la captura muestra 5 valores 1dp y bracket entero |
| Denominador           | **No**        | supply total vs circulante — no dicho                                            |
| Exclusiones           | **No**        | pools, burn, LP-locked, dev, exchanges… silencio total                           |
| <5 holders            | **No**        | la captura solo prueba el caso de 5; no hay card con 3                           |
| Creator share         | **No**        | no dice cómo se identifica al creator                                            |

El ejemplo de docs (3 valores) es **ilustrativo/truncado**; la captura (5 valores) manda para la forma. `<5` sigue siendo decisión de producto (F4).

### 10.3 Realidad de datos hoy (código verificado)

- `SnapshotQuote` expone SOLO `holders` (conteo) y `top10HolderPercent` (`snapshot-quote.types.ts` L78-79). **No existe** array por-wallet.
- **Origen de `holders` corregido:** en el fan-out viene de agregadores; en el **fast path** es `basics.holders.length` = el tamaño de la lista de `getTokenLargestAccounts` (≤20 cuentas), **no un conteo real de holders** (`direct-fast-path.service.ts:500-507`). No usar `holders` como denominador ni como verdad.
- `top10HolderPercent` (fan-out) = `getTokenSupply` + `getTokenLargestAccounts`, suma `largest.slice(0,10)` **por CUENTA**, descarta direcciones, `?? 0` por entrada, **sin exclusiones**, denominador supply total (`provider-quote.fetchers.ts:701-726`). Incluye vaults de pool/curva → inflado por diseño.
- Ya existe la maquinaria de holders: `toHolderEntries(holders, supply.amount)` (`onchain-solana.reader.ts:547-564`) devuelve `{address, amount, sharePercent}` con `Number(BigInt(amount))/Number(BigInt(supply))*100`, y `topShare(entries, 10)` (`:566-580`) suma los N primeros **en el orden recibido** (no re-ordena; `getTokenLargestAccounts` devuelve descendente, pero el merge por owner obliga a re-ordenar). `OnchainHolderEntry` L93-97.
- `TokenAccountEntry` (`solana-rpc.types.ts` L13-19) trae `address` + montos, **no** el owner: `getTokenLargestAccounts` devuelve **CUENTAS DE TOKEN (ATAs)**, no wallets.
- Para pasar de ATA a wallet hay que decodificar el data de la cuenta. **Ya existe el decoder**: `decodeTokenAccount(bytes) → {mint, owner, amount: bigint}` (`token-accounts.codec.ts:34-52`), `TOKEN_ACCOUNT_MIN_LEN = 165` (`:25`, usar `>=` — Token-2022 con extensiones mide más), `isUninitializedTokenAccount(bytes)` (`:184-186`, mint Y owner en cero). Exportado en `onchain/index.ts:56,61`. **No escribir un segundo decoder.**
- `SolanaAccountInfoValue` (L36-43): `data: [base64, 'base64']`, `owner`, `lamports`, `executable`, `rentEpoch`. Su `owner` es el **programa dueño de la CUENTA** (Token Program), **NUNCA el holder** — el holder sale del decode. `getMultipleAccounts` pide `encoding:'base64'` (`solana-rpc.service.ts:311-318`), así que `data[0]` es base64.
- Transporte batcheado listo: `getMultipleAccounts(addresses)` (`solana-rpc.service.ts:270-288`: chunks ≤100 en UNA ronda paralela, `null` por cuenta, nunca throw) + alias congelado `getMultiple` (`:295`, `BatchAccountsClient` `solana-rpc.types.ts:69-72` — **no renombrar**).
- **No hay fuente EVM keyless por-wallet:** Etherscan `tokenholderlist` es PRO; BSC no tiene Blockscout (RESEARCH-49); Moralis/Birdeye requieren key (Moralis pausado). → **TH v1 es SOLANA-ONLY; en BSC (KODA) queda en silencio.**

### 10.4 Dónde vive el cálculo + coste

**Fetcher propio `solana-holders`** (NO dentro de `solana-rpc`):

- `supportsChains: ['solana']`, tier `free`. Registro **en dos sitios**: `QUOTE_FETCHER_COST_TIER` (`provider-quote.fetchers.ts:203-218`, es un `Record` de clasificación **sin semántica de orden**) **y** el array de `buildProviderQuoteFetchers` (`:238+`), inmediatamente después de `solana-rpc` — **ese array define el orden de ejecución, no el Record**.
- **Tres specs pinnean orden/keyset y se actualizan en el mismo commit:** `cascade-order.spec.ts:55-68` (lista exacta de nombres), `provider-quote-newprov.spec.ts`, `zero-cost-cascade.spec.ts:66-68` (free antes que keyed).
- **No** es fila de `DEFAULT_PROVIDERS`: sin descriptor → sin breaker (el `recordFailure` early-returna para nombres desconocidos, `provider-registry.service.ts:119-122`) y bucket propio por defecto **60/min**.
- Corre **en paralelo** con `solana-rpc` dentro del fan-out → `totalSupply`/`top10HolderPercent` dejan de estar en riesgo (fix de C5).
- **4 llamadas RPC** por cold Solana: `getTokenSupply` (1) + `getTokenLargestAccounts` (1) + batch ATA (1) + batch wallets (1); chunks ≤100 → 1 llamada cada una. Duplica supply+largest respecto a la variante "dentro del fetcher" (+2 llamadas): se paga a cambio de aislar los campos legacy. Medirlo en el soak.
- **Coste de bucket:** `applyOutboundRateLimit` cobra `cost` **por invocación del fetcher** (default 1, `rate-limited-fetchers.ts:40-56`) → las 4 RPC internas consumen **1 token**; a 60/min aguanta 60 colds/min, muy por encima de la cadencia (~2/min). El cálculo de 4 req contra el límite público de 40 req/10 s sí es por llamada real.
- **`applyOutboundRateLimit` PUEDE lanzar** al agotar el bucket (`rate-limited-fetchers.ts:52`) → el fetcher envuelve TODO en try/catch y degrada a `null`; nunca propaga.
- **Presupuesto propio dentro del fetcher:** `SNAPSHOT_HOLDER_CONCENTRATION_TIMEOUT_MS` (default **3800** desde 2026-10-26 — el 1500 original moría en TODA llamada del transporte keyed; la calibración medida está en §10.13; resolver con fallback pinneado como `resolveHoneypotTimeoutMs`) mediante `Promise.race`; al vencer resuelve `holderConcentration: null` y nada más (las llamadas abandonadas mueren por su timeout interno, igual que `withTailBudget`). El deadline de fan-out (4000 ms) queda de backstop y el pin `DEFAULT < SNAPSHOT_FANOUT_DEADLINE_MS_DEFAULT` es un test.
- **Kill-switch:** `SNAPSHOT_HOLDER_CONCENTRATION_ENABLED` (default habilitado; false-ish → no llamadas, sin campo, sin nota).
- Fail-open total: cualquier gap (tier caído, decode fallido, supply 0/null, timeout, rate-limit) → `null`, nunca throw, nunca afecta a otros campos.

### 10.5 Contrato de datos — dos opciones

**Opción A (recomendada) — objeto coherente, un solo writer**

```ts
/** Solana-only. `topPercents` NO CRECIENTE (empates válidos), `0..5`
 *  entradas: `[]` = silencio, `1..5` = render (el objeto puede existir
 *  con `[]`; no es malformado). `top10Percent` suma los top-10 de la
 *  MISMA lista mergeada-por-wallet, ya filtrada, en el MISMO orden,
 *  bajo el MISMO denominador: al ser sumas acumuladas sobre el mismo
 *  array, `sum(topPercents) <= top10Percent` es exacto. */
export interface HolderConcentration {
  readonly topPercents: ReadonlyArray<number>;
  readonly top10Percent: number;
}
```

- `SnapshotQuote.holderConcentration?: HolderConcentration | null`
- **Obligatorio (3 ediciones):** (1) `SNAPSHOT_QUOTE_FIELDS` (L120-144) **y** `emptySnapshotQuote()` (L146+) como `null` explícito; (2) **ensanchar `MergeAcc`** con `| HolderConcentration` (C1); (3) clave explícita en el edge compat (C3).
- `top10HolderPercent` legacy (`{{top10HolderPercent}}`) **NO se toca** y se documenta como **métrica distinta** (por cuenta, pool-inclusiva). **Regla:** un body no puede mezclar ambos en el mismo card.
- Historial: `snapshot_history.quote` es jsonb y persiste el quote completo (`address-snapshot.service.ts:1833-1834`), así que el campo viaja en SWR/stale sin trabajo extra. Añadir el test de SWR (el replay lo sirve tal cual, con el mismo trato de honestidad que `venue`/`launchpad` vivos vs números stale).

**Opción B (descartada) — dos campos sueltos** (`topHolderPercents` + `top10HolderPercentExcludingPools`): dos writers/validadas independientes → drift y media fila. Rechazada por el mismo motivo por el que `market1hRow` es UNA key compuesta.

### 10.6 Política de cálculo (borrador v1 — requiere OK, ver §10.11)

Cada punto es una **decisión de producto**, no una inferencia de los docs.

**Orden de ejecución real (no negociable): merge → exclusiones → orden descendente → acumulados → corte.**

1. **Denominador = supply TOTAL** (`getTokenSupply`). Único on-chain; el circulante es reportado por agregadores y suele faltar.
2. **Merge por wallet:** acumular **en BigInt** (`amount` ya viene en base units) sumando por `owner`; convertir a `Number` UNA sola vez al calcular el porcentaje (`Number(BigInt(amount)) / Number(BigInt(supply)) * 100`, patrón ya usado en `onchain-solana.reader.ts:547-564`). Documentar el techo de precisión `Number` para u64 (error relativo ~1e-16, aceptable para un porcentaje).
3. **Exclusiones sobre la lista mergeada, ANTES de ordenar y de cortar** (§10.6.4). El corte no puede precederlas o `sum ≤ top10` deja de ser cierto.
4. **Exclusiones v1, EN ESTE ORDEN:**
   - **Cuenta sin inicializar primero** (`isUninitializedTokenAccount`) → excluida (mint y owner en cero; sin este paso, un ATA sin inicializar se colaría como "burn").
   - owner == `11111111111111111111111111111111` (dirección del System Program usada como holder) → **UN patrón de burn**, no "el sink canónico"; el incinerador SPL no tiene constante en el repo (F9).
   - wallet **program-owned** (el `owner` de la cuenta wallet ≠ System Program) → excluida: captura pool/curva/PDA/vault. **Coste aceptado:** también cae una wallet multisig (Squads) → falso NEGATIVO, nunca falso positivo.
   - **wallet account `null`** (la dirección no existe on-chain, p. ej. el incinerador) → **excluida**, razón documentada. Nunca se inventa su ownership.
   - Se descarta excluir por lista de marcas/CEX: no hay fuente keyless → sería invención.
5. **Acumulados y corte:** re-ordenar descendente; `topPercents` = primeros `min(5, n)`; `top10Percent` = suma acumulada de los primeros **`min(10, n)`** de esa misma lista. El acumulador solo recorre índices existentes (`i < n`): `undefined` jamás entra a la suma. **Sin el `min`, todo token con menos de 10 wallets produce `NaN` y se silencia** — justo el caso de los tokens nuevos.
6. **< 5 wallets:** renderizar las que haya (1..5); `0` → silencio. **Nunca** padding.
7. **Límites duros:** `supply === 0n` o `null` → `null`. `top10Percent` fuera de `[-ε, 100+ε]` → `null`; dentro del margen se **clampea a `[0,100]` para display** (nunca se descarta un token legítimamente 100%-held por un ulp tras el redondeo BigInt→Number). Cualquier porcentaje no finito → `null`, chequeado antes de emitir (`JSON.stringify` convertiría `NaN`/`Infinity` en `null` por accidente — fail-open por diseño, no por suerte).
8. **Cota honesta:** `getTokenLargestAccounts` devuelve ≤20 cuentas, así que el top-10 post-merge es un **lower bound** del top-10 real de wallets, nunca un sobrestatement.
9. **Creator bold: OUT de v1.** Requiere resolver la wallet del creator (no existe hoy) + cambiar la composición de "escapar una vez" a "escapar cada valor y componer con `*` crudo" (MarkdownV2 bold = UN `*`; `**` se renderiza literal — lección `nameLink`).

### 10.7 Renderer (dexter) — una sola key compuesta

Precedente exacto: `market1hRow` (`template-renderer.service.ts:659-692`) + `honeypotBlock` (`:651-657`).

- Key: **`holderTopRow`**, registrada en **`DERIVED_PLACEHOLDERS`** (`placeholder-registry.ts:51-133` — ese catálogo ordenado es el **seam de resolución**; añadirla solo por comando o solo a META deja el body irresoluble y el preview roto) y en la composición de TODOS los comandos (`ca|x|z|bare`, + `c|cc` con timeframe) → registry **22 base + 31 derived = 53** (`54` para `c|cc`); `PLACEHOLDER_META` gana un entry `{type:'derived', nullable:true, example}` con la forma monoespaciada de §10.13 y los `\n` DENTRO del ejemplo (como `honeypotBlock`, `placeholders.controller.ts:182-186`).
- Valor: `""` (silencio) o **`"\n\n👥 TH: " + <payload>`** — mismas mecánicas que `honeypotBlock` (`"\n\n🍯 " + core`): **línea en blanco delante**, evidenciada por la captura (§10.1b). El silencio no deja etiqueta colgada ni línea en blanco. `cleanupDanglingSeparators` **NO** se toca (sus familias bracket/backtick/`⇨` tienen guards anti-link delicados; además **no colapsa blancos**, así que no hay red de seguridad para un `\n` de más — de ahí §10.8).
- Payload: `p1⋅p2⋅…⋅pN [M%]` con UN espacio antes del bracket. **Monoespaciado (owner, 2026-10-26):** cada porcentaje va en su PROPIO code span de MarkdownV2, unido por `⋅`, y el bracket conserva sus escapes V2 FUERA del span (forma exacta del wire en §10.13). Dentro de un code entity los números viajan CRUDOS: `codeV2Text` (solo escapa la barra invertida y la propia backtick), NUNCA `escapeV2Text` — un escape de punto dentro del span imprime su backslash.
- Formato: cada valor `toFixed(1)` **conservando el cero** (`2.0`, `4.3`) porque el único material documentado/capturado muestra 1 decimal; `formatPercentText` NO sirve (trimmea y pierde el `.0`), `formatMoneyText` tampoco.
- **Bracket y coherencia de display (en décimas enteras):** `displayedTenths = Σ round(p_i * 10)` sobre los MISMOS valores formateados; `bracket = Math.max(Math.round(top10Percent), Math.ceil(displayedTenths / 10))`. Sumar décimas **evita el acarreo binario** (`0.1+0.1+0.1+16.1+3.6 = 20.000000000000004` haría `ceil → 21` con suma impresa 20.0). Garantiza que la fila nunca se contradiga: jamás un bracket menor que los números impresos.
- **Guard de coherencia:** `sum(topPercents) > top10Percent + HOLDER_SUM_EPSILON` → silencio. `ε = 1e-9` (puntos porcentuales), **una sola constante por app** (dexter no puede importar de market-data; `COMPUTED_FDV_EPSILON_*` es FDV-scoped, no reutilizable) y **el mismo literal pinneado en los dos specs**. El invariante es exacto cuando ambos lados acumulan sobre el MISMO array en el MISMO orden (§10.6.5); el ε absorbe el re-acumulado de dexter y el redondeo de display, **no la serialización** (JSON preserva el double exacto).
- **Orden:** el cliente rechaza `topPercents` que no sea **no creciente** (`p[i] >= p[i+1]`); los empates son válidos.
- Silencio (`""`) si: objeto ausente/null/malformado; `topPercents` vacío o >5; valor no finito o fuera de 0-100; `top10Percent` no finito o fuera de 0-100; suma incoherente. **Nunca `N/A`, nunca media fila.**
- Escapado: **code spans (owner 2026-10-26)** — cada valor se formatea primero y se envuelve con `MessageFormatterAdapter.codeV2Text` (escapa SOLO la barra invertida y la backtick, que es lo único que la spec de Telegram exige dentro de un code entity); los corchetes se escapan FUERA (`\[`, `\]`). La fila emite exactamente DOS backslashes y cero escapes de punto. `⋅` y `%` viajan crudos. **NUNCA** `escapeV2Text` dentro del span y **NUNCA** escapar dos veces.
- Cliente/pipeline: guard `toHolderConcentrationOrNull` en `market-data.client.ts` (patrón `toVenueOrNull`/`toHoneypotOrNull`, L80+) → rechaza arrays malformados, >5 entradas, no finitos, fuera de rango, no no-creciente y `sum > top10 + ε`; `ResolvedToken.holderConcentration?: … | null` (opcional para no romper los literales existentes); **añadirlo al tipo estructural inline de `toResolvedToken`** (`token-scan.pipeline.ts:302-345`) + mapearlo, o se descarta en silencio; re-validación en el pipeline (doble validación, precedente `honeypot`/`venue`).
- **Línea legacy** `👥 Holders` de `message-formatter.ts` (~L325, card `formatScanCard`): NO se toca.

### 10.8 Body — NO aplicar en esta lane

**La versión viva NO se puede afirmar desde el repo.** Este plan la cita como **v15** (§2 L54, P0-11 L88, L180, L319) y el operador la reporta como **v20**; el row es operator-owned y no está en git, `FULL_DEXTER_BODY` (`message-template-seed.service.ts:45`) es otra línea base y `runOnce` nunca sobreescribe un `(command,name)` existente. **Antes de cualquier edit: leer la fila viva y registrar versión + body + `isActive` en el preview.**

Cambio propuesto (una versión más), **solo tras OK del owner**:

`…{{ageSuffix}}{{market1hRow}}{{holderTopRow}}{{honeypotBlock}}`

- **Inserción CONDICIONAL, no "pura":** `holderTopRow` y `honeypotBlock` ya aportan su `\n\n`. Las tres keys deben quedar **contiguas, sin `\n` del body entre ellas**; si el body vivo trae separadores propios, eliminarlos en el mismo edit. Un `\n` extra = 3 `\n` = dos líneas en blanco, y `cleanupDanglingSeparators` no colapsa blancos.
- **Eliminar `{{top10HolderPercent}}`** si está presente (C8): la semilla trae `👥 Holders {{holders}} • Top 10 {{top10HolderPercent}} • {{devLine}}` (`message-template-seed.service.ts:45`). Dos "top 10" con políticas distintas en el mismo card es lo prohibido.
- Orden TH → después de 1H: **resuelto por evidencia** (§10.1b), ya no es fork.
- Preview obligatorio en dos escenarios: `1H` presente + `TH` presente, y `1H` en silencio + `TH` presente (aquí se ve la contigüidad). Verificar `placeholdersUsed`.

### 10.9 Tests failing-first (cuando se implemente)

**market-data**

- `holder-concentration.service.spec.ts` (o el nombre del lane) — decode ATA vía `decodeTokenAccount`, `>= 165` con extensiones, merge BigInt por owner, exclusiones en orden (uninitialized → burn `1111…` → program-owned → wallet `null`), **exclusiones antes del corte**, re-orden descendente, **acumulados con `min(10,n)`** (`sum(top5) ≤ top10` exacto; **n = 1..9 no produce `NaN`**), denominador supply total, `supply 0n/null`, <5 y 0, no finitos, `top10 ≥ 100` clampeado, timeout propio → `null`, kill-switch, rate-limit throw → `null`.
- `provider-quote-holder-concentration.spec.ts` — el fetcher emite SOLO `holderConcentration`; **tabla de call-counts por caso**: happy **4** (supply, largest, batch ATA, batch wallets) · `largest === null` → **1** y cero extra · `supply` null/0 → **1** y corta · decode parcial → **4** igual (los batches ya se pagaron) · timeout → corta donde esté. Chunks ≤100; un decode fallido se salta esa cuenta (no anula el objeto); campo listado en `SNAPSHOT_QUOTE_FIELDS` + `emptySnapshotQuote()`; `MergeAcc` compila con el objeto.
- `cascade-order.spec.ts` / `provider-quote-newprov.spec.ts` / `zero-cost-cascade.spec.ts` — lista ordenada de nombres actualizada con `solana-holders` después de `solana-rpc`.
- `gateway-market-data-snapshot.spec.ts` — la clave viaja en el edge compat y **NO** en batch.
- `address-snapshot-holder-concentration-stale.spec.ts` — el replay SWR/stale sirve el objeto de la fila (sin recalcular), con el trato de honestidad ya existente.

**dexter**

- `template-renderer-holder-top-row.spec.ts` — matriz: 5/3/1 valores, `[]` → `""`, objeto null → `""`, >5 → `""`, no finito/rango → `""`, `sum > top10 + ε` → `""`, prefijo exacto `"\n\n👥 TH: "`, formato `4.3` (cero conservado), **bracket desde décimas** (el caso `0.1+0.1+0.1+16.1+3.6` da 20, no 21), **code spans por valor** (12 backticks = 6 spans, exactamente 2 backslashes, cero escapes de punto, cero escapes de backtick), sin `N/A`, catálogo/META, counts 53/54.
- `market-data-client-holder-concentration.spec.ts` — guard: no-objeto, `topPercents` no array, >5, **no no-creciente** (con empates válidos), no finito, fuera de rango, `sum > top10 + ε`, strings, ausente.
- `token-scan-holder-concentration.spec.ts` — passthrough + re-validación + el campo aparece en `ResolvedToken` (seam `toResolvedToken`).
- `placeholders.controller.spec.ts` (nuevo) — **todos** los keys de **todos** los comandos tienen fila en `PLACEHOLDER_META` (C9).
- Pins de conteo en los specs de registry/rick-card existentes (52→53, 53→54).

### 10.10 Docs a actualizar (cuando se implemente)

- `apps/market-data/AGENTS.md` — sección nueva `HOLDER CONCENTRATION (TH)`: contrato, política (denominador/exclusiones/orden/lower-bound), fetcher propio + coste (+4 RPC = 1 token), cadena (Solana-only), fail-open, y el typo de `TOKEN_2022_PROGRAM` si se limpia.
- `apps/dexter-onchain-bot/AGENTS.md` — registry 53/54, la key derivada, mecánica `\n\n`, reglas de silencio/ε/coherencia de display, referencia a este §10.
- `docs/deployment/market-data-staging-soak.md` — contadores nuevos: tasa de `holderConcentration: null` en Solana, latencia del fetcher y nº de llamadas RPC extra.
- Este plan: al implementarse, mover §10.11 a "resueltas" con la decisión firmada.

### 10.11 Decisiones del owner (TH) — RATIFICADAS 2026-10-26 (ver §10.13)

1. **F1 — Alcance:** ¿aceptamos que TH sea **Solana-only** (KODA/BSC en silencio, aunque Rick sí lo muestre), o el owner abre una fuente keyed (Moralis/Birdeye/Covalent) rompiendo "free-forever"?
2. **F2 — Denominador:** supply total (recomendado) vs circulante reportado.
3. **F3 — Exclusiones:** (a) ninguna; (b) uninitialized + burn + program-owned + wallet-null (recomendado); (c) además lista curada de pools/CEX (necesita fuente, hoy inexistente).
4. **F4 — <5 wallets:** renderizar 1..5 (recomendado) vs exigir exactamente 5 o silencio.
5. **F5 — Redondeo:** 1dp con cero conservado (evidencia) + bracket `max(round, ceil(décimas/10))` (recomendado) vs `floor` vs trim.
6. **F6 — Creator bold:** fuera de v1 (recomendado) vs incluirlo (requiere resolución de la wallet del creator + composición con `*` crudo).
7. **F7 — ~~Orden en el card~~:** **RESUELTO por evidencia** — TH va después de `1H`, separada por una línea en blanco (§10.1b). Ya no es decisión.
8. **F8 — Fast path:** (a) calcularlo ahí y (c) desactivar el fast serve quedan **DESCARTADAS**: `tryResolve(..., 800)` es all-or-nothing (`address-snapshot.service.ts:1470-1478`), así que una pata TH ahí dentro puede perder el fast serve COMPLETO (ya se incumplen los 800 ms con 2 rondas secuenciales, 900-1200 ms medidos; TH añade 2), y (c) lo desactivaría justo en los tokens fríos. **Única opción viva: (b) cards fast TH-silenciosos** → `holderConcentration` ausente/null **sin** nota `degraded` y **sin** `honeypot:fast-path`: el precedente correcto es el **lock** (null silencioso), no el honeypot (que sí anota porque su ausencia es fallo de análisis; la de TH es límite de alcance). Spec-pinnear: fast path → objeto ausente, `degraded` sin cambios.
9. **F9 — Burn/null-wallet:** ¿basta `1111…` como único patrón de burn (recomendado) o el owner quiere además el incinerador SPL (requiere constante verificada, hoy no existe en el repo)? ¿Y confirmamos "wallet `null` → excluida"?

**Gate:** firmar F1-F9 **no** desbloquea la implementación por sí solo: §10.0 tiene precondiciones que son contratos (C1 `MergeAcc`, C3 edge compat, C5 fetcher aislado, C8 limpieza del body) y C4 depende de F8. **C2 es limpieza opcional, no bloquea.** Sin F1-F9 firmadas **y** C1/C3/C5/C8 resueltas, NO se escribe código, NO se edita el body, NO se activa nada. El `RickBurpBot` sigue inactivo.

### 10.12 Riesgos

| Riesgo                                                         | Mitigación                                                                                                                                            |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lista dominada por el vault del pool/curva → fila engañosa     | F3(b): excluir uninitialized/burn/program-owned/null **antes del corte**; si el owner elige (a), el silencio es preferible a una fila falsa           |
| Token con <10 wallets silenciado por `NaN`                     | `min(10, n)` en el acumulador (§10.6.5) + spec de n=1..9                                                                                              |
| Un token 100%-held descartado por un ulp                       | Guard `[-ε, 100+ε]` + clamp a `[0,100]` para display (§10.6.7)                                                                                        |
| Excluir program-owned tira wallets multisig                    | Falso NEGATIVO aceptado y documentado (Squads); nunca falso positivo                                                                                  |
| Un ATA sin inicializar se clasifica como burn                  | Filtrar `isUninitializedTokenAccount` ANTES de la exclusión de burn (§10.6.4)                                                                         |
| Top-10 es lower bound (ventana de 20 cuentas)                  | Documentado; nunca sobrestatement                                                                                                                     |
| Token-2022                                                     | Reusar `decodeTokenAccount` (`>= 165`, program-agnóstico); **no** gatear por program id (C2)                                                          |
| +4 RPC y días 429-walled                                       | Fetcher propio en paralelo + presupuesto 3800 ms (medido; §10.13) + kill-switch + try/catch (el rate-limit gate lanza); los campos legacy no se tocan |
| Bracket menor que la suma mostrada / `ceil` inflado por floats | Décimas enteras + `max(round(top10), ceil(décimas/10))` (§10.7)                                                                                       |
| Dos "top 10" distintos en el mismo card                        | C8: eliminar `{{top10HolderPercent}}` del body nuevo + regla documentada                                                                              |
| `[N%]` con exclusiones no comparable con Rick                  | Los docs de Rick NO documentan exclusiones → no reclamamos paridad numérica, solo estructura                                                          |
| Línea en blanco doble o fila colgada                           | Contigüidad obligatoria de las tres keys (§10.8) + leer la fila viva + preview con 1H vacío y con 1H presente                                         |
| `truncateText` puede cortar entre `\` y el carácter escapado   | Preexistente (`message-formatter.ts:45-52`); la fila alarga el tail ~40 chars → más exposición. Fuera de alcance: anotado, no corregido aquí          |

### 10.13 Implementación + evidencia live (2026-10-26)

**Alcance entregado (código only):** commit `c6e9245b` en `dev` — 31 ficheros; market-data **164 suites / 1357 tests**, dexter **82 suites / 971 tests**, `tsc --noEmit` limpio en las dos apps. Deploys de staging **verdes**: `40329711489` (market-data) + `40329711364` (dexter), con Branch Governance `40329711396` y CI `40329711648`. **No** se editó ningún body, **no** se activó nada.

**market-data (productor)**

- `snapshot/domain/snapshot-holder-concentration.ts` — política congelada (TOP_N 5, TOP10_N 10, ε `1e-9`) + resolvers de env.
- `provider/infrastructure/quote-fetchers/holder-concentration.ts` — `computeHolderConcentration` (supply → largest → 1 batch de ATAs → merge en BigInt por wallet → drop de importe 0 → las 4 exclusiones EN ORDEN → sort desc → `min(5,n)` / `min(10,n)`) + `buildHolderConcentration` puro para guards/clamp.
- `provider-quote.fetchers.ts` — fetcher `solana-holders` en la posición 5 (justo tras `solana-rpc`), tier `free`, kill-switch, presupuesto propio de 3800 ms (recalibrado 2026-10-26 desde 1500 tras medir el transporte keyed), `try/catch` total.
- `snapshot-aggregator.service.ts` — `MergeAcc` ensanchado con la unión **concreta** `| HolderConcentration` (C1).
- `snapshot-quote.types.ts` — campo + `SNAPSHOT_QUOTE_FIELDS` + `emptySnapshotQuote()`.
- `market-data-snapshot.controller.ts:96` — clave explícita en el whitelist del compat edge (C3); el batch queda intacto.
- C2 **no** se tocó (sigue siendo limpieza opcional). C8 **no aplica todavía** (no se editó body).
- Specs nuevas: `holder-concentration.spec.ts`, `snapshot-holder-concentration.spec.ts`, `provider-quote-holder-concentration.spec.ts` + pins de orden/keyset actualizados (`cascade-order`, `provider-quote-newprov`, `zero-cost-cascade`).

**dexter (renderer)**

- `market-data.client.ts` — `toHolderConcentrationOrNull` (guarda de forma, orden no creciente con empates válidos, coherencia `sum ≤ top10 + ε`).
- `scan-pipeline.port.ts` + `token-scan.pipeline.ts` — `HolderConcentrationInfo` y el campo **declarado** en el tipo estructural de `toResolvedToken` (sin declararlo, el pipeline lo tira en silencio).
- `template-renderer.service.ts` — key `holderTopRow`: `""` o `"\n\n👥 TH: " + payload`; 1dp con el cero conservado; bracket en décimas enteras; cada valor en su code span (`codeV2Text`) y el bracket escapado fuera del span.
- `placeholder-registry.ts` — alta en `DERIVED_PLACEHOLDERS` tras `market1hRow` + whitelist de TODOS los comandos (**53** keys en `ca|x|z|bare`, **54** en `c|cc`).
- `placeholders.controller.ts` — `PLACEHOLDER_META` con el ejemplo literal `\n\n👥 TH: …` (C9) + spec de completitud del catálogo.
- Specs nuevas: `template-renderer-holder-top-row.spec.ts`, `market-data-client-holder-concentration.spec.ts`, `token-scan-holder-concentration.spec.ts`.

**Verificación live (staging, read-only)**

- Catálogo de dexter `:4061`: `ca` = 53 keys, `c`/`cc` = 54, `holderTopRow` presente con su META.
- Preview `A{{holderTopRow}}B` → `"AB"`: la key resuelve y **silencia** — no filtra el placeholder literal, no deja `N/A`, no deja etiqueta colgada.
- Preview `HDR{{market1hRow}}{{holderTopRow}}{{honeypotBlock}}` → `HDR📉 1H: 8\.1K ⋅ \-1% 🅑 13 Ⓢ 24` (forma monoespaciada desde 2026-10-26: ver §10.13): el tail sigue limpio con TH en silencio.
- **TH no se ha observado todavía con datos reales**: en esta ventana todos los tiers de RPC de Solana están caídos desde el host de staging (`api.mainnet.solana.com` → **429**, `solana.publicnode.com` → **403**, Helius 429), así que `solana-rpc` y `solana-holders` responden `no data` y el campo sale `null` por diseño fail-open. La fila exacta (`4\.3⋅3\.3⋅2\.8⋅2\.3⋅1\.8 \[20%\]`) está pinneada **por spec**, no por observación live. No se inventó ni se forzó ningún valor para "demostrar" la fila.

**Recalibración del presupuesto TH + primera fila live (2026-10-26, después de `6f27cac3`)**

Diagnóstico medido (Helius keyed, leído por NOMBRE desde `apps/market-data/.env`, nunca impreso): `getTokenSupply` ≈**247 ms**, `getTokenLargestAccounts` **2360–2936 ms** (n=20), `getMultipleAccounts` ≈**257 ms** por lote; el camino es SECUENCIAL (supply → largest → lote ATAs → lote wallets) ⇒ **3.15–3.70 s** en el happy path. El presupuesto original de **1500 ms** quedaba por debajo de esa banda y **todas las cards live previas al cambio leyeron `holderConcentration: null`**; el RPC público (`api.mainnet.solana.com`) responde **429** justo en `getTokenLargestAccounts`, así que el tier público no puede rescatar la pata. Esto es una calibración, no un cambio de contrato: la política §10.6 queda intacta.

- Fix: `SNAPSHOT_HOLDER_CONCENTRATION_TIMEOUT_MS_DEFAULT` **1500 → 3800** (cabe la banda medida y sigue por debajo del deadline de fan-out de 4000 ms, que es el backstop). Test nuevo pinea `DEFAULT < SNAPSHOT_FANOUT_DEADLINE_MS_DEFAULT` para que un futuro ajuste no rompa el orden.
- `.env.example`: bloque de tuning opcional con `SNAPSHOT_HOLDER_CONCENTRATION_ENABLED=true` + `SNAPSHOT_HOLDER_CONCENTRATION_TIMEOUT_MS=3800` y la razón medida (cierra el pendiente 5).
- Docs: `apps/market-data/AGENTS.md` gana `BUDGET CALIBRATION` y `docs/deployment/market-data-staging-soak.md` §4 gana la lectura de `abandoned at fanout deadline (4000ms)` (presión de latencia, no caída de proveedor).
- Verificación: market-data **164 suites / 1358 tests** verdes, `tsc --noEmit` limpio.

**Primera fila TH real (dev `:4000`, pm2 id 6 reiniciado con el build nuevo).** BONK `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` cold: `status: ready`, `stale: false`, **3.507 s**, `sources: [dexscreener, geckoterminal, solana-rpc, solana-holders, coingecko]`, `providerErrors` SIN clave `solana-holders`, y

```json
"holderConcentration": {
  "topPercents": [8.830700941879325, 6.792953673448346, 3.6204544529811615, 3.0550385529742394, 3.0423870911992643],
  "top10Percent": 38.23674188221453
}
```

Línea de serve de esa llamada: `directMs=800 fanoutMs=1822 kindMs=0 tailMs=406 existenceMs=246 totalMs=3507`. Repetición inmediata: **2.1 ms** (cache) con el MISMO objeto, `stale: false`. Segunda muestra (WIF `EKpQGS…5zcjm`, cold **2.925 s**): `topPercents [13.7245, 10.1374, 3.8269, 3.6201, 3.4812]`, `top10Percent 43.7192`, `sources` con `solana-holders`. Honestidad: ese `fanoutMs=1822` muestra que en esa llamada el RPC fue más rápido que la banda medida n=20 (por eso el presupuesto no se ata en llamadas rápidas y solo acota la cola lenta). El `top10HolderPercent` legacy de BONK (38.24, per-cuenta y pool-inclusivo) coincide numéricamente con nuestro `38.2367` per-wallet, pero son métricas DISTINTAS: coincidencia de este token, **no** una reclamación de paridad. La fila renderizada por dexter sigue sin observarse contra el body vivo: eso depende del owner (pendientes 1-2).

**Staging post-deploy (mismo commit `eca171e6`, deploy `40337827218` verde).** El dist desplegado lleva `3_800`; la sonda keyed a BONK devuelve `holderConcentration: null` con `solana-holders: "no data"` y ambos endpoints públicos de Solana en backoff 429 (`api.mainnet.solana.com`, `api.mainnet-beta.solana.com`). Causa: staging NO tiene `HELIUS_RPC_URL_MAINNET` (leído por nombre) y los tiers free-B tienen `getTokenLargestAccounts` excluido por diseño, así que `getTokenSupply` responde pero el método de holders está amurallado. Es la lectura honesta esperada, no una regresión de TH: la fila se sirve en dev con el transporte keyed. Queda anotado en el runbook de soak §4 como regla de lectura propia; se cierra cuando aterrice la key de Helius de staging (owner queue).

**Monoespaciado de los números (owner, 2026-10-26 — body y activación siguen siendo del owner)**

Pedido textual del owner (dos formas, wire y render):

```text
📉 1H: `1.1K` ⋅ `-4.1%` 🅑 `25` Ⓢ `26`
👥 TH: `2.4`⋅`1.3`⋅`1.2`⋅`1.2`⋅`1.2` [`12%`]
```

Implementado en el renderer:

- Nuevo `MessageFormatterAdapter.codeV2Text` (`message-formatter.ts`): envuelve el valor YA formateado en un code entity de MarkdownV2 y escapa SOLO la barra invertida y la backtick (lo único que la spec de Telegram exige dentro de `code`); vacío → `""` (nunca un par de backticks suelto). No se usa `escapeV2Text` dentro del span: un escape de punto ahí imprime su backslash.
- `market1hRow`: `📈`/`📉`, `1H:`, `⋅`, `🅑`, `Ⓢ` quedan como texto estático; cada uno de los cuatro números viaja en su PROPIO span. La fila emite CERO backslashes (antes `1\.6M`).
- `holderTopRow`: cinco spans unidos por `⋅` + el bracket como `\[` + span + `\]` — los corchetes conservan su escape FUERA del span. `⋅` y `%` crudos.
- META del catálogo (`placeholders.controller.ts`) actualizada con la forma monoespaciada en AMBOS keys; specs re-pinneados (12 backticks = 6 spans y exactamente 2 backslashes en TH, cero en 1H).
- Riesgo pre-existente, NO nuevo: `enforceLengthText` puede cortar dentro de un span si el body supera 4096 — antes ya podía cortar entre la barra y el carácter escapado. Anotado, no corregido en esta lane.

**Verificación dev (2026-10-26, `:4060`, BONK, build + `pm2 restart dexter`).** Preview real:

```text
📈 1H: `18.8K` ⋅ `1.1%` 🅑 `308` Ⓢ `421`

👥 TH: `8.8`⋅`6.8`⋅`3.6`⋅`3.1`⋅`3.0` \[`38%`\]
```

Silencio verificado con un token sin los campos (`A{{holderTopRow}}B` → `AB`, `A{{market1hRow}}B` → `AB`) y el catálogo devuelve la META nueva en ambos keys. dexter **82 suites / 971 tests** verdes + `tsc --noEmit` + prettier limpios.

**Staging (deploy `40869291275` verde sobre `3558f85f`).** El catálogo `:4061` sirve la META nueva en AMBOS keys. Preview con `token` echo (sin proveedores, con los valores exactos del pedido):

```text
📉 1H: `1.1K` ⋅ `-4.1%` 🅑 `25` Ⓢ `26`

👥 TH: `2.4`⋅`1.3`⋅`1.2`⋅`1.2`⋅`1.2` \[`12%`\]
```

Un preview por address (BONK) en staging devuelve `Token not found` — market-data staging no resuelve ese mint en esta ventana (proveedores 429), no un fallo del renderer; el path `token` prueba el build desplegado sin red.

**Sigue pendiente (requiere OK explícito)**

1. Editar el body vivo de `RickBurpBot` para insertar `{{holderTopRow}}` — contiguo a `{{market1hRow}}` (la fila baja su propia línea en blanco) y **eliminando** `{{top10HolderPercent}}` si estuviera (C8). Leer antes versión + body + `isActive`.
2. Cualquier activación del template.
3. Cutover a prod (`master`) — fuera de alcance por instrucción permanente.
4. C2 (`TOKEN_2022_PROGRAM`) sigue como limpieza opcional no aprobada.
5. ~~Declarar `SNAPSHOT_HOLDER_CONCENTRATION_ENABLED` / `SNAPSHOT_HOLDER_CONCENTRATION_TIMEOUT_MS` en `.env.example`~~ HECHO 2026-10-26: bloque de tuning opcional al final de `apps/market-data/.env.example` con los defaults (habilitado / 3800 ms) y la razón medida.

### 10.14 Emoji de estado en el título — `{{newTokenIcon}}` (🆕, <15 min) — CÓDIGO IMPLEMENTADO 2026-10-30

**Regla del producto (ratificada por el owner).** Los docs de Rick (`https://docs.rick.bot/features/pricebot#scan-icons`) listan, literal:

> 🆕 - token age under 15 minutes.

Es el **emoji de estado del título**, no un icono de launchpad: va ANTES del `{{headerIcon}}` (que sigue siendo el `[💊](url)` de launchpad o el emoji de cadena). Reproducido como key SEPARADA para poder componer `{{newTokenIcon}}{{headerIcon}}` → `🆕💊` / `🆕🟡`, exactamente como Rick.

**Fuente del dato.** `values.pairCreatedAt` — el MISMO ISO de la mejor pareja (mejor liquidez) que ya usa `age`. Sin campo de wire nuevo, sin fuente nueva, sin llamada extra. Caveat de proxy heredado de `age`: es edad de la PAREJA, no de deploy del token; una migración curva → AMM sub-reporta y un token maduro puede leerse como "nuevo".

**Contrato (calculado en cada render con `Date.now()`):**

| Entrada                                             | Valor | Razón                                                                        |
| --------------------------------------------------- | ----- | ---------------------------------------------------------------------------- |
| `pairCreatedAt` no string / `''` / no parseable     | `""`  | silencio; nunca se inventa una edad                                          |
| `Date.parse(iso) > Date.now()` (futuro)             | `""`  | guard EXPLÍCITO: `{{age}}` clampa futuro a `0m` y reclamaría "recién creado" |
| `0 <= now - at < 15 * 60_000`                       | `🆕`  | "under 15 minutes"                                                           |
| `now - at >= 15 * 60_000` (incluye exactamente 15m) | `""`  | "under" = estrictamente menor; 15m exactos callan                            |

Emoji CRUDO: sin `escapeV2`, sin espacio delante ni detrás (el body es dueño de la composición). Constante `NEW_TOKEN_ICON_MAX_AGE_MS = 15 * 60 * 1000` exportada por el renderer.

**Por qué key separada y no dentro de `headerIcon`.** (1) `headerIcon` ya tiene una cadena de resolución binaria (launchpad link → `chainDisplay`) y sus bytes están pinneados por specs/templates existentes; meterle un tercer estado cambiaría su salida en tokens nuevos. (2) El orden visual (`🆕` antes del icono) es composición del body, no del renderer — una sola key compuesta obligaría a duplicar la lógica de launchpad/cadena. (3) Silencio independiente: un token nuevo sin emoji de cadena debe renderizar solo `🆕`.

**No-goals explícitos (no implementados, no documentados por Rick).**

- 🚀 / 🟢 / 🔴 / ⚠️ como estados de título: el doc NO documenta su disparador ni la PRECEDENCIA entre ellos (¿el 🆕 gana a un ⚠️?). No se codifica ninguna jerarquía.
- 🔼 y `/Bitcoin`: aparecen en capturas pero NO están documentados; fuera de alcance.
- No se toca ningún body sembrado, ni el seed, ni la DB: la key queda disponible para que el owner componga `{{newTokenIcon}}{{headerIcon}}` cuando lo decida.

**Estado.** Código + specs (13 tests nuevos) + META de catálogo; registry 22 base + 32 derivadas = **54** keys en `ca|x|z|bare` / **55** en `c|cc`. Sin body edit, sin activación.

### 10.15 Launchpad (bonding-curve) — layout CORTO — CÓDIGO IMPLEMENTADO 2026-10-30

**Regla del producto (docs de Rick).** Mientras el token sigue en la bonding curve de un launchpad, Rick NO usa la tarjeta completa. Citas literales (docs de Rick, layout de tarjeta):

> Tokens still on a launchpad bonding curve use a shorter layout: `🆕💊` - the launchpad headline drops `[FDV/24h change]`; `⏳ 45% @ Pump` - bonding progress, launchpad; There is no USD or Liq row, and `5M:` replaces `1H:`.

Es un **layout alternativo**, no una tarjeta nueva: las MISMAS keys de la tarjeta normal siguen disponibles y las 7 keys nuevas se auto-silencian FUERA de la curva, así que **un solo body** puede servir ambos layouts y un body que no las usa queda byte-idéntico. `headerIcon` ya cubre la mitad 💊 de `🆕💊` (el 🆕 lo pone `{{newTokenIcon}}`, §10.14).

**Contrato de wire (frozen, propiedad de market-data).** Campo top-level opcional en el snapshot:

```ts
bondingCurve?: {
  onCurve: boolean;               // strict true = verificado on-chain, sigue en la curva
  launchpadId: string;            // 'pump-fun'
  quoteSymbol: string | null;     // p.ej. 'Bitcoin'
  quoteMint: string | null;
  progressPercent: number | null; // 0..100 inclusive; null = desconocido
} | null;
```

Guard de frontera `toBondingCurveOrNull` (cliente dexter): rechaza (→ `null`) salvo objeto no-array, `onCurve === true`, `launchpadId` string no vacío, `quoteSymbol`/`quoteMint` ausentes/null o strings no vacíos, y `progressPercent` ausente/null o número finito en `[0,100]`. El pipeline re-valida igual en `toResolvedToken` (doble validación, patrón `honeypot`/`venue`/`holderConcentration`); el campo DEBE quedar declarado en el tipo estructural inline o se descarta en silencio (misma clase de bug que `holderConcentration`). Cuatro campos 5m opcionales (`volume5mUsd`, `priceChange5m`, `txns5mBuys`, `txns5mSells`) se validan exactamente como los de 1H (`toFiniteNumberOrNull` / `toNonNegativeCountOrNull`); en el port son opcionales (`?: number | null`) para que los literales existentes compilen y el pipeline siempre pone `null` explícito.

**Keys (todas en cada comando, en este orden justo después de `newTokenIcon`):**

| Key                | Fuera de curva                                                                       | En curva                                                         | Silencio                                                         |
| ------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `curveRow`         | `""`                                                                                 | `"\n⏳ "` + `[<prog>% ]` + `"@ "` + nombre display del launchpad | sin curva; y sin progreso NI nombre → `""`                       |
| `quoteSuffix`      | `""`                                                                                 | `"/" + quoteSymbol` (p.ej. `/Bitcoin`)                           | sin curva o `quoteSymbol` null                                   |
| `fdvChangeBracket` | `"\\[" + fdvUsd + "/" + priceChange24h + "\\] "` (brackets ESCAPADOS, espacio final) | `""`                                                             | ambos valores desconocidos → `""` (nunca `[N/A/N/A]`)            |
| `usdRow`           | `"\n💰 USD: "` + priceUsd en code span (`codeV2Text`, valor RAW)                     | `""`                                                             | —                                                                |
| `liqRow`           | `"\n💦 Liq: "` + liquidityUsdSide en code span + liquidityFlags fuera del span       | `""`                                                             | —                                                                |
| `market5mRow`      | espejo de `market1hRow` con `5M:`, BAJA LÍNEA NUEVA (`"\n📈 5M: …"`)                 | igual                                                            | cualquiera de los 4 valores 5m ausente/no finito (counts `>= 0`) |
| `marketRow`        | `market1hRow` (bytes de fila idénticos) + `"\n"`                                     | `market5mRow` (byte-idéntico)                                    | hereda el silencio de la key elegida, sin línea en blanco        |

`curveRow` formatea el progreso con `formatPercentText` (ya emite `%`; el `%` no es especial V2) y usa `resolveLaunchpadDisplayName` (override `launchpadName` → `pump-fun` a `Pump`), escapado UNA vez (fallback detector con punto → `pump\.fun`). Si el snapshot NO trae `launchpad` (el caso exacto de estos mints: el detector devuelve null), el nombre cae a `bondingCurve.launchpadId` sintetizando `{id, name: id}` para que el override `launchpadName` siga aplicando; sin ninguno de los dos se omite el `@ nombre`. El progreso es opcional: con `progressPercent: null` la fila queda `⏳ @ Name` (o `""` si tampoco hay nombre). `market5mRow` comparte helper privado con `market1hRow` (bytes de la FILA 1H pinneados sin cambios), misma composición monoespaciada (cada número en su code span, CERO backslashes).

**Corrección post-preview 2026-10-30 (`market5mRow` / `marketRow` bajan su propia línea).** El preview de staging destapó que ambas keys emitían la fila DESNUDA (`sin \n`), así que en el body v17 quedaban PEGADAS a la línea anterior (`Age: \`3m\`📉 5M: …`, y en tarjeta completa `💦 Liq: \`147.9K\`📉 1H: …`). La alternativa por body (un `\n`literal antes de`{{marketRow}}`) deja una LÍNEA EN BLANCO cada vez que la fila calla — y calla en las dos tarjetas del mint de referencia (5m no-USD) y en cualquier token sin ventana. Ambas keys emiten ahora `"\n" + fila`cuando la fila existe y`""`cuando calla, la misma mecánica de`usdRow`/`liqRow`/`curveRow`(se pegan al FINAL de la línea anterior del body). Bytes: la FILA es idéntica a`market1hRow`(pinneado),`market1hRow`NO cambia (sigue sin`\n`, key legacy), `marketRow`=`"\n"`+ fila elegida. El body v17 no cambia ni una letra. Pinneado end-to-end en`template-renderer-bonding-curve.spec.ts` (4 estados: curva+5m, curva sin 5m, fuera de curva, silencio).

**`fdvChangeBracket` es dueña del escapado de SUS corchetes.** `[` y `]` están en el set reservado de MarkdownV2 fuera de la sintaxis de link; el valor compuesto debe emitir `\[` / `\]` (precedente exacto: `holderTopRow`, que ya emite `\[`/`\]`). Un body compone la key DESNUDA (`*{{fdvChangeBracket}}${{symbol}}*`); ponerle corchetes literales alrededor (`\[{{fdvChangeBracket}}\]`) duplicaría el escape y el render imprimiría `\[…\]`. Un solo lado escapa, y es la key.

**`[N/A/N/A]` no existe.** Si `fdvUsd` y `priceChange24h` son AMBOS desconocidos (no finito / null) la key emite `""`: un headline `*[N/A/N/A] $NET*` es ruido, no dato. Con UN lado conocido el bracket sí sale y el otro lado imprime `N/A` (`\[9\.6K/N/A\] `), igual que el resto del body.

**Composición de headline (sample):**

```text
*{{fdvChangeBracket}}${{symbol}}{{quoteSuffix}}*
```

Fuera de curva → `*\[9.6K/353%\] $NET*` (el body renderiza el par escapado; ver la nota de arriba: el bracket crudo de §5.3 era un 400 garantizado). En curva → `*$NET/Bitcoin*` (el bracket desaparece). Fila de ventana: `{{marketRow}}` → `5M:` en curva / `1H:` fuera.

**Composición con el body objetivo (v17, supersede §5.3).** Las DOS filas que el layout corto elimina (`💰 USD:`, `💦 Liq:`) y el bracket del headline se componen SOLO con estas keys; una misma línea estática no puede silenciarse. **TODA key que empieza con `\n` se pega al FINAL de la línea anterior** (mecánica de `honeypotBlock` / `holderTopRow`): una key sola en su propia línea del body produce una línea en blanco SIEMPRE (el `\n` del body MÁS el `\n` de la key), no solo cuando calla — verificado en el preview (el `⏳` salía tras un blanco). Body completo, listo para pegar:

```text
{{headerIcon}} {{nameLink}} *{{fdvChangeBracket}}${{symbol}}{{quoteSuffix}}*
🌐 {{chainName}}{{venueSuffixShort}}
💎 FDV: {{fdvUsd}} ⇨ {{fdvAth}} \[{{fdvAthAgo}}\]
📊 Vol: {{volume24hUsd}}{{ageSuffix}}{{honeypotBlock}}{{usdRow}}{{liqRow}}{{marketRow}}{{curveRow}}
```

Reglas de composición, pinneadas:

- `usdRow` / `liqRow` son la versión MONOESPACIADA correcta de las filas de §5.3 (`💰 USD: \`<precio>\``, `💦 Liq: \`<lado>\`<flags>`): el número viaja RAW dentro del code span (`codeV2Text`: escapa solo `\` y backtick; `0.00007707`, jamás `0\.00007707`) y las flags quedan FUERA del span. **NO hay paridad byte-a-byte con §5.3**: el body de §5.3 compone `` `{{priceUsd}}` `` (placeholder crudo dentro de backticks) y eso imprime el backslash — es el defecto documentado abajo. La paridad que se exige es con la INTENCIÓN de §5.3 (mismo texto, número monoespaciado, CERO backslashes en la fila), y por eso §5.3 queda reemplazada por este body.
- **Defecto de §5.3 (documentado; el body v17 lo evita):** envolver un placeholder crudo en backticks (`` `{{priceUsd}}` ``) NO produce monospace correcto — el renderer escapa el valor con `escapeV2Text` (`0\.00007707`) y dentro de un code entity el backslash se imprime. Regla general: **un número que deba ir monoespaciado necesita una key compuesta** (`usdRow`, `liqRow`, `marketRow`, `holderTopRow`, `market1hRow`/`market5mRow`), nunca backticks alrededor de un `{{placeholder}}` crudo. Las filas `FDV`/`Vol`/age de §5.3 no tienen key compuesta todavía: en v17 van SIN backticks (texto escapado normal, correcto pero no monoespaciado) hasta que exista una lane de `fdvRow`/`volRow`.
- Los corchetes de `{{fdvAthAgo}}` son texto ESTÁTICO del body, así que el body los escapa (`\[…\]`); los de `fdvChangeBracket` los escapa la KEY. Nunca los dos.
- **`cleanupDanglingSeparators` colapsa el par escapado vacío (`\[\]`).** El body v17 escapó sus corchetes estáticos, así que un `fdvAthAgo` vacío deja `\[\]` — el trío crudo `[]` NO lo ve (hay un backslash dentro del par). Se añadió un cuarto trío (trailing/leading/mid, mismas reglas de hspace y mismo guard anti-link `(?!\()`) ANTES de la regla del `⇨` colgante: `💎 FDV: 8\.3K ⇨ 2\.5K \[\]` → `💎 FDV: 8\.3K ⇨ 2\.5K`; con el ATH también vacío, la regla del `⇨` remata → `💎 FDV: 8\.3K` (verificado en vivo: sin esta regla el preview servía `⇨  \[\]`). Un par CON contenido (`\[7d\]`) NUNCA se toca; `\[\](url)` tampoco (guard por simetría con la familia cruda, aunque un par escapado no es link). Pinneado en `template-renderer.service.spec.ts` (cleanup + render-level v17 con ATH frío y con `7d`).
- `usdRow` / `liqRow` NUNCA conviven con la línea combinada del seed (`💰 {{priceUsd}} ({{priceChange24h}}) • MC … • Liq …`): se reemplaza, no se duplica. El seed no se toca.
- El `{{nameLink}}` del headline NO se silencia en curva (Rick lo omite en la captura, pero los docs solo documentan que cae `[FDV/24h change]`): residual documentado, fuera de las 7 keys. Si el owner lo quiere fuera, necesita una octava key condicional (no implementada).
- **Dependencia de orden entre lanes (L3):** en curva `{{marketRow}}` delega en `{{market5mRow}}` SIN fallback. Si market-data publica `bondingCurve` antes que los cuatro campos 5m, la fila de actividad DESAPARECE de toda tarjeta en curva. Las dos mitades (`bondingCurve` + `priceChange5m`/`txns5m*`/`volume5mUsd`) se despliegan juntas, y el body v17 se activa DESPUÉS.
- **Residual del proxy de edad (heredado de §10.14, no se corrige aquí):** `{{newTokenIcon}}` y `{{age}}` leen el `pairCreatedAt` de la MEJOR pair; en un token en curva esa pair es la AMM (Meteora), no la curva. Un token recién migrado puede renderizar `🆕` junto a `⏳` (o `🆕💊`). La fuente honesta sería el timestamp de creación de la CUENTA de curva — fuera de esta lane.

**No-goals explícitos (sin key, sin fuente de datos; NO implementados).**

- `🔥 #N` trending rank — no hay fuente en el snapshot.
- `📺` viewers — no hay fuente.
- `👨‍💻 DEV` — no hay fuente/atribución de dev en esta ruta.
- `🧬` — no hay dato ni key detrás.
- No se toca ningún body sembrado, ni el seed, ni la DB, ni el body vivo del owner: las keys quedan disponibles para que componga el layout corto cuando lo decida.

**Estado.** Código + specs (`template-renderer-bonding-curve.spec.ts`, `market-data-client-bonding-curve.spec.ts`, `token-scan-bonding-curve.spec.ts`) + META de catálogo; registry 22 base + 39 derivadas = **61** keys en `ca|x|z|bare` / **62** en `c|cc`. Correcciones post-review 2026-10-30 aplicadas en la MISMA lane: `fdvChangeBracket` escapa sus corchetes y calla con ambos valores desconocidos, `curveRow` cae a `bondingCurve.launchpadId` cuando el snapshot no trae `launchpad`, `usdRow`/`liqRow` emiten el número dentro de un code span (cero backslashes). El preview en vivo destapó un cuarto defecto (par escapado vacío `\[\]` visible con `fdvAthAgo` frío) y se cerró con el cuarto trío de `cleanupDanglingSeparators` (ver reglas de composición). Sin body edit, sin activación, sin migración.

### 10.16 Launchpad (bonding-curve) — lane market-data — DISEÑO CORREGIDO 2026-10-30 (NO implementado)

> Cierra el lado emisor de §10.15: sin `bondingCurve` en el snapshot, las 7 keys dexter quedan en silencio y la tarjeta sigue siendo la completa. Hoy es exactamente lo que pasa: `launchpad: null`, `venue: {dexId:'meteora', labels:['DYN2']}` y `degraded: true` para el mint de referencia.

**Root cause (corregido con probe on-chain + DexScreener + IDL oficial, 2026-10-30).** El mint `2dNdT2gD8x2BkmffjAyQe3o6hES33jg1tAgTJCRkvBTC` tiene TRES pares en DexScreener:

| Par           | DEX     | Quote                    | Liq    | Estado                                                                                      |
| ------------- | ------- | ------------------------ | ------ | ------------------------------------------------------------------------------------------- |
| `5sqQd6…QiCC` | pumpfun | `Bitcoin` `Hytpiy…Dpump` | null   | cuenta de curva de **166 B**, owner `6EF8rre…F6P`, `complete = false`, **= el PDA clásico** |
| `DGTRED…MFb9` | meteora | SOL                      | $25.53 | par migrado (post-graduación, DYN2)                                                         |
| `BbaM9…uJ9S`  | meteora | USDC                     | $0.94  | par que gana "mejor liquidez" y de donde salen `priceUsd 8.261e-6` / `fdv 8261`             |

La cuenta de la curva **es** el `pairAddress` del par pumpfun y **es** el PDA `[b"bonding-curve", mint]` bajo `6EF8rre…F6P` (`5sqQd6fn8FqNkRerAYcz2gewDd97JHe9fvGASwRqQiCC`, bump 254 — vector absoluto en §PDA).

**`src/launchpad/infrastructure/solana-pda.ts` ESTÁ MAL (bug, no "no se toca").** Las constantes de ed25519 son incorrectas, así que TODA derivación de esa app es errónea:

| Constante         | Valor en el código (MAL)                                                       | Valor correcto (`@solana/web3.js` + RFC 8032)                                   |
| ----------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `ED25519_D`       | `3709570593466944313808350875456518954211387984321901638878553308594028357065` | `37095705934669439343138083508754565189542113879843219016388785533085940283555` |
| `ED25519_SQRT_M1` | `196811613767075059568070793049885420154460665159018070209982863036521263069`  | `19681161376707505956807079304988542015446066515923890162744021073123829784752` |

Derivaba `G1Tavd…CDhNA` (cuenta inexistente) en vez de `5sqQd6…QiCC`; el check "on-curve" era falso-positivo/negativo por la aritmética torcida. **Prerequisito de la lane: corregir las dos constantes y pin­near vectores ABSOLUTOS** (derivados con `@solana/web3.js` 1.98.0, no con nuestro propio código):

```text
[bonding-curve, 2dNdT2…BTC]        → 5sqQd6fn8FqNkRerAYcz2gewDd97JHe9fvGASwRqQiCC (254)
[bonding-curve, 2o1wth…pump]       → 35oVuGayp4kgTyQNPoXKeAU4mT1ujWCRrkCTd1HevzUZ (255)
[bonding-curve, WSOL]              → 6PiyjiAPkp2KdZtqkyQYzVsD1Prv7t8v4TaYd8ip4YFd (253)
[metadata, METAPLEX, WSOL]         → 6dM4TqWyWJsbx7obrdLcviBkTafD5E8av61zfU6jq57X (255)
[metadata, METAPLEX, Hytpiy…pump]  → 2gvncxFdRKWtuz2Qz2k2fCC59pJtfoBbtQzMQNdND6sL (255)
```

Esto también arregla `getTokenBasics` (identity Metaplex) y el leg `launchpad-detector`, que hasta hoy derivaban PDAs falsos.

**Layout autoritativo (`pump-fun/pump-public-docs` IDL `639b87f` 2026-10-13 + `@pump-fun/pump-sdk@4.3.1`).**

```text
disc [23,183,248,55,96,216,172,96]  8B   @0
virtual_token_reserves   u64        @8
virtual_quote_reserves   u64        @16    (antes *_sol_* — mismos offsets)
real_token_reserves      u64        @24
real_quote_reserves      u64        @32
token_total_supply       u64        @40
complete                 bool       @48
creator                  Pubkey     @49
is_mayhem_mode           bool       @81
is_cashback_coin         bool       @82
quote_mint               Pubkey     @83   ← 32B, NO Option; all-zero = SOL-like
creator_fee_bps          u64        @115
… append-only hasta 166B
```

Ocho longitudes históricas (`49, 81, 82, 83, 115, 124, 125, 141`, más 151/166): **cada layout es prefijo del siguiente**. Regla de decode: `len < 49` → `null`; zero-pad a 166 antes de leer; `quote_mint` SOLO si `len >= 115`, si no `Pubkey::default()`. **El tamaño NO distingue SOL de token-quote** (166 B puede ser cualquiera de los dos): la única señal es `quote_mint`. Valores live de la cuenta (slot del probe): `realTokenReserves = 272126872931864`, `tokenTotalSupply = 1000000000000000`, `complete = 0`, `quote_mint = HytpiyuR3sVXGB5UqoqrnThCPH2X1tWVm5neep3Dpump`.

**Quote symbol (on-chain, cacheado, nunca adivinado).** Orden cerrado:

1. `quote_mint` all-zero / WSOL / Token-2022 native ⇒ `quoteSymbol: null`, `quoteMint: null` (SOL-like; cero red extra).
2. Token-2022 mint (`owner === Tokenz…`) ⇒ leer la CUENTA del quote mint (1 lectura) y parsear el TLV posterior a los 165 B + account-type@165: `[u16 type][u16 len][value]`, **type 19 = TokenMetadata**, value = `update_authority(32) + mint(32) + name(String u32len) + symbol(String u32len) + uri(String) + additional_metadata`. Primer `symbol` no vacío gana.
3. Fallback Metaplex: PDA `[metadata, metaqbxx…, quoteMint]` (1 lectura) y `symbol` = `data[105 : 105 + u32le(data@101)]` (constantes `MAX_NAME_LENGTH=32`, `MAX_SYMBOL_LENGTH=10`; el offset robusto alternativo es `101 = 65 + 4 + nameLen`).
4. Nada de eso ⇒ `quoteSymbol: null` (el `quoteMint` SÍ se emite: es un dato leído, no un guess).
5. Cache in-process por quote mint (bounded, reset-on-deploy): un mint repetido paga cero lecturas. El caso de referencia resuelve `Bitcoin` en el paso 2 — su quote mint es Token-2022 con metadata embebida (`F7931A`/`Bitcoin`/`ipfs://…`) y **Metaplex responde `null`**.

**Progreso (pinneado, no se ajusta a Rick).**

```text
progress% = clamp(100 × (1 − realTokenReserves / 793_100_000_000_000), 0, 100)   // 4dp
```

Denominador = sold-out de pump.fun en unidades base (793.1M tokens × 1e6), **no** `tokenTotalSupply` (1e15). Con la cuenta live da **≈65.69%**; con el slot del probe anterior (212.588B) daba 73.1953%. Es **no monótono** (una venta lo baja; se midió 1.09 pts de deriva en 3 min): no se redondea al entero de Rick ni se toca el denominador.

**Wire (frozen; ya consumido por §10.15 y validado por `toBondingCurveOrNull`).**

```ts
bondingCurve?: {
  onCurve: boolean;               // true SOLO con complete === false leído on-chain
  launchpadId: string;            // 'pump-fun' (id de launchpad-table.ts)
  quoteSymbol: string | null;     // 'Bitcoin' · null cuando el quote es SOL-like o no resuelve
  quoteMint: string | null;       // base58 del quote mint, null si SOL-like
  progressPercent: number | null; // 0..100, 4dp
} | null;
```

**Detección.** El gate es la VERDAD ON-CHAIN; DexScreener NO participa:

1. **PDA derivado (local, sin red)** con el helper YA CORREGIDO.
2. **Lectura:** UNA `getMultiple([pda])`. `null` / owner ≠ pump / `len < 49` → `bondingCurve: null` (fail-open, nunca throw). NO se filtra por par DexScreener: un token de pump sin par indexado también se detecta.
3. **Decode** con `pump-bonding-curve.codec.ts` (zero-pad, `quote_mint` si `len >= 115`). `decodePumpCurve` devuelve `null` con `complete !== 0` ⇒ graduado = `bondingCurve: null` (nunca `onCurve:false`).
4. **Progreso** con el `realTokenReserves` de la MISMA lectura.
5. **Quote** por el orden de arriba (1-2 lecturas extra, cacheadas).
6. `launchpadId = 'pump-fun'`.

**Seam del reader (una sola casa para el decode + quote).**

- Método nuevo `OnchainSolanaReaderService.getPumpCurve(mint): Promise<BondingCurveReading | null>`: deriva PDA, lee la cuenta, decodifica, resuelve quote (cache), calcula `onCurve/quoteSymbol/quoteMint/progressPercent` en unidades humanas (4dp). Es lo que consume el fan-out.
- `OnchainPoolView` gana `curve?: { realTokenReserves: bigint; tokenTotalSupply: bigint; quoteMint: string | null }` rellenado por `pumpView` desde el MISMO decode (el fast path ya pagó la lectura) — **cero red extra en el fast path**. El quote symbol del fast path se resuelve por el mismo cache/lectura (1 lectura la primera vez, 0 después).
- `pumpView` deja de hardcodear el leg B como WSOL cuando `quote_mint` no es SOL-like: usa el quote mint real y sus decimals (`mintDecimals`). **`priceBA` deja de estar mal** para curvas token-quoted. Es un fix de correctitud dentro del mismo archivo; el precio servido en tarjeta sigue viniendo del par DexScreener/Meteora (no se mezcla).

**Coste real.**

- **Fast path:** 0 lecturas extra de curva (reutiliza `pdaP` + `getPoolView`); +1 lectura SOLO la primera vez por quote mint (cache).
- **Fan-out:** 1 lectura de cuenta (curva) + 1-2 la primera vez por quote mint. Se acepta y se documenta; solo Solana token-kind.
- **DexScreener:** 0 llamadas nuevas por este leg.

**Campos 5m (`market5mRow`) — fuente y honestidad.**

- Fuente: el par **`dexId === 'pumpfun'`**, NO la mejor pair. Selector nuevo `selectPumpfunPairForSlug(pairs, slug)` (explícito, sin ordenar por liquidez, primer match con `chainId === slug`).
- `volume5mUsd` ← `volume.m5`; `priceChange5m` ← `priceChange.m5`; `txns5mBuys`/`txns5mSells` ← `txns.m5.buys`/`sells` (par completo o ambos `null`).
- **Honestidad por CLASE de quote, no por valor:** quote no-USD/SOL ⇒ los CUATRO a `null` (DexScreener no mide ese mercado en USD) y la fila calla. Quote USD/SOL ⇒ valores VERBATIM (un `0` real sobrevive). Para el mint de referencia ⇒ `market5mRow: ""` (honesto: no hay fila de actividad hasta que exista fuente).
- Los cuatro viajan solo en el compat edge `GET /api/market-data/snapshot`; el batch reducido no.

**Plumbing (lista COMPLETA).**

1. `src/launchpad/infrastructure/solana-pda.ts` — constantes corregidas + vectors absolutos en el spec (prerequisito; arregla también `getTokenBasics` y el detector).
2. `src/provider/infrastructure/onchain/pump-bonding-curve.codec.ts` (+ spec) — zero-pad a 166, `quoteMint` (`len >= 115`, all-zero ⇒ `null`), `creator` opcional.
3. `src/provider/infrastructure/onchain/onchain-solana.reader.ts` (+ spec) — `getPumpCurve(mint)`, `OnchainPoolView.curve`, `pumpView` con quote real, resolver de quote symbol (Token-2022 TLV type 19 → Metaplex → null) + cache.
4. `src/provider/infrastructure/dexscreener/dexscreener.service.ts` + types — 4 campos 5m en `DexScreenerPairSummary`/`toPairSummary`, `selectPumpfunPairForSlug`.
5. `src/snapshot/application/discovery-cache.service.ts` — `toSummaryFromTripwire` mapea los 4 campos 5m (el hit a 30d es el camino normal).
6. `src/snapshot/domain/snapshot-quote.types.ts` — 4 campos 5m en `SnapshotQuote` + `SNAPSHOT_QUOTE_FIELDS` + `emptySnapshotQuote`.
7. `src/provider/infrastructure/quote-fetchers/provider-quote.fetchers.ts` — único escritor de los 4 campos 5m (clase de quote por `dexId === 'pumpfun'` y quote USD/SOL).
8. `src/snapshot/domain/snapshot.types.ts` — `BondingCurveInfo` + `bondingCurve: BondingCurveInfo | null` REQUERIDO en `AddressSnapshot`.
9. `src/snapshot/application/address-snapshot.service.ts` — TODOS los literales con `bondingCurve` explícito (`:1485` fast, `:1531`, `:1711`, `:1825`, `:1937`, `:2644`, `:2736`, invalid) + fan-out Solana-token que lo calcula (`getPumpCurve`).
10. `src/snapshot/application/direct-fast-path.service.ts` — `FastPartial.bondingCurve` desde `poolView.curve` + su mapeo al literal del fast path.
11. `src/gateway/infrastructure/http/market-data-snapshot.controller.ts` — whitelist: `bondingCurve` + los 4 campos 5m. El batch no.
12. Specs: `solana-pda` (vectors), codec, reader (`getPumpCurve`, cache, TLV/Metaplex), dexscreener (5m + selector), discovery-cache (tripwire 5m), snapshot-quote types, `address-snapshot-bonding-curve`, `direct-fast-path-bonding-curve`, controller (whitelist).

**Serve paths que NO calculan la curva (pinneado).** SWR-now, stale replay, invalid card y background refresh sirven `bondingCurve: null` explícito — MISMA clase aceptada que `launchpad`/`venue`/`pairCreatedAt`. Consecuencia documentada: un replay stale de un token en curva renderiza el layout COMPLETO (bracket + `1H`) y el siguiente serve fresco vuelve al corto. Persistirlo en `snapshot_history` exigiría columna jsonb nueva + migración: NO en v1.

**Caveats pinneados.**

- `quoteSymbol` puede faltar aunque `quoteMint` exista (metadata ilegible) ⇒ headline `$NET` (sin `/Bitcoin`), tarjeta corta y correcta.
- El quote puede ser un memecoin: `priceUsd`/`fdv` de la curva son `null` en DexScreener y el precio USD sigue viniendo del par Meteora.
- `launchpadId` desconocido para dexter ⇒ fallback al id crudo escapado.
- Staging necesita la fila DisplayMap `(launchpad, pump-fun, 💊)` + `(launchpadName, pump-fun, Pump)` para `💊` y `@ Pump`; se aplican con `npm run seed:display-maps -- --apply`, nunca en boot.
- `getTokenBasics` (identity) mejora sola con el PDA corregido — no es un cambio de contrato, es el fix del bug.

**Acceptance (staging, mint de referencia).**

1. `GET /api/market-data/snapshot?chain=solana&address=2dNdT2gD…` → `bondingCurve.onCurve === true`, `launchpadId 'pump-fun'`, `progressPercent` entre 60 y 80 (la cuenta se mueve), `quoteSymbol === 'Bitcoin'`, `quoteMint === 'Hytpiy…Dpump'`.
2. Mint graduado (SCRIP `y95bhwz…pump`) → `bondingCurve: null` (nunca `onCurve:false`).
3. Mint que no es de pump → `bondingCurve: null` (fail-open), coste = 1 lectura.
4. Cuenta null/corta/owner ajeno/timeout → `null`; tarjeta completa intacta.
5. Preview dexter con el body v17 de §10.15 → `⏳ <prog>% @ Pump`, sin `💰 USD:` ni `💦 Liq:`, bracket ausente, `5M`/`1H` en SILENCIO, headline `*$NET/Bitcoin*`.
6. Off curve → bytes del body v17 (bracket `\[…\]`, `💰 USD: \`<precio>\``, `💦 Liq: \`<lado>\``, `📈 1H:`). NO se compara contra §5.3 literal (superseded).

**Orden de ejecución.** (1) PDA fix + vectors → (2) reader/codec (curva + quote) → (3) campos 5m + selector + discovery + snapshot quote → (4) `bondingCurve` en `AddressSnapshot` + fast path + fan-out + controller → (5) `tsc`/jest/prettier → (6) commit a `dev` + deploy staging → (7) probe referencia + SCRIP + no-pump → (8) el owner compone el body v17 y activa. `bondingCurve` y los 4 campos 5m van en el MISMO deploy; el body se activa DESPUÉS. Sin tocar `master`, sin deploy prod, sin body edit.

## 10.17 Follow-up 2026-10-30 — replay persistence (evidencia de staging)

**Hallazgo medido (staging, deploy `41125242042`).** El pin "replays sirven `null`" NO es una consecuencia aceptable en la práctica: el background refresh re-persiste una fila `ready` cada ~30-40 s, así que `swr-now` se re-arma indefinidamente y el "siguiente serve fresco" NUNCA llega. Dos llamadas separadas 40 s al mint de referencia:

```
call #1  staleAgeMs 81307  source=swr-now  bondingCurve null  venue null
call #2  staleAgeMs 39428  source=swr-now  bondingCurve null  venue null
```

La edad BAJA ⇒ el refresh re-persistió. Ciclo observado: cache HIT (<30 s) → SWR (≥30 s) → refresh → cache. Resultado: en estado estacionario el layout corto es inalcanzable, no "visible hasta el próximo serve fresco". Evidencia: `.omo/evidence/rick-compact-card-staging-probe.log`.

**Decisión del owner (2026-10-30, aprobada).** Persistir la curva DENTRO del `snapshot_history.quote` jsonb existente — SIN migración y SIN columna nueva — y servirla en SWR-now y en el replay stale sujeto a una cota de frescura `SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS` (default `600000` = 10 min). El refresh de background RECALCULA la curva (misma lectura y mismo budget de 1500 ms que el serve fresco) para que el valor persistido siga la graduación en un ciclo. La tarjeta invalid sigue `bondingCurve: null` sin condición. El wire no cambia (top-level `bondingCurve`): el consumidor dexter no se toca.

**Trampa de orden de spreads (pineada).** En `tryServeSwrNow` y en el literal stale, `bondingCurve` estaba ANTES de `...emptySnapshotQuote()` / `...row.quote`; al pasar a servir el valor persistido DEBE ir DESPUÉS, o el spread del quote gana incluso cuando la cota está excedida.

**Defecto documental corregido.** El fixture "graduado" que figuraba en §10.16 acceptance #2, `y95bhwzuuapjj9gebxfebuzzeccrvw6kqxkqczcpump`, tiene 43 caracteres y `getAccountInfo` devuelve `value: null` en ambas variantes de caja ⇒ el `status:"invalid"` + `providerErrors:["existence"]` de staging era CORRECTO; la dirección estaba mal transcripta. Fixture real de graduación: `2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump` (curva `35oVuGayp4kgTyQNPoXKeAU4mT1ujWCRrkCTd1HevzUZ`, owner `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`, 151 B, `complete@48 = 1`, `realTokenReserves = 0` ⇒ `bondingCurve: null` verificado en staging).

**RPC keyed en staging.** `HELIUS_RPC_URL_MAINNET` añadido por el asistente a `/opt/onchain-bot-staging/apps/market-data/.env.staging` (backup `.env.staging.bak-20261030`, `600 root:root`, copiado del `.env.staging` del backend sin imprimir valor) + recreate del contenedor. Log: `Solana RPC mode: keyed (primary host=mainnet.helius-rpc.com, public fallback armed)`. `HELIUS_API_KEY` sigue ausente ⇒ el leg Helius-origin (`dev:helius`) permanece `null`.

**Replay persistence VERIFICADO en staging (deploy `41154178029`, commit `249fa457`).** Secuencia de tres llamadas al mint de referencia: (1) replay del row legacy → `swr-now`, `bondingCurve: null`; (2) tras el refresh → serve fresco `bondingCurve {onCurve:true, launchpadId:'pump-fun', quoteMint:'Hytpiyu…Dpump', progressPercent:63.0939}`, `launchpad: pump-fun`, `venue: meteora`, `holderConcentration` no-null; (3) 47 s después → `swr-now` sirviendo **la curva PERSISTIDA verbatim** (`progressPercent:63.0939` idéntico). Es decir: el layout corto ya sobrevive a los replays; la costura de spreads está bien puesta.

**DEFECTO de constante encontrado en la misma ventana (corregido).** `TOKEN_2022_PROGRAM` estaba pineada como `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnAAvKmd1qT6M`; el programa desplegado (y el owner real de la quote-mint, leído on-chain vía el RPC keyed: `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`, 411 B) no coincide. Consecuencia: el gate `owner === TOKEN_2022_PROGRAM` del `PumpQuoteResolver` era falsamente falso ⇒ `quoteSymbol: null` en staging aunque los bytes ya decodificaban `Bitcoin`. **Clase de bug idéntica a `solana-pda.ts`**: todos los specs construían el owner del fixture DESDE la constante, así que la suite quedaba verde (punto ciego auto-consistente). Corregido + pin del literal on-chain en `pump-quote.resolver.spec.ts` + aserción `TOKEN_2022_PROGRAM === literal`. Verificación de la decodificación sobre los bytes reales de staging: ext 18 len 64 @166, ext 19 len 173 @234, name `F7931A`, symbol `Bitcoin`, uri IPFS — el parser nunca estuvo mal; el gate sí. `holderConcentration` y `launchpad` también empezaron a resolver con el RPC keyed (antes `null`).

## 10.18 Preview v17 en staging 2026-10-30 — 5M alcanzable + defecto de composición

**Lane market-data cerrada (deploy `41156007740`, commit `e79b92a3`).** El bucket 5m tenía UN solo productor — el fetcher `dexscreener` del fan-out — pero el DIRECT FAST PATH sirve exactamente la clase donde el bucket existe (una curva con quote SOL/USD siempre pricea ⇒ `priced !== null` gana el fast serve) y NO corre fetchers. Medido en staging: `FXRorC4…pump` (SOL, on curve) servía los cuatro en `null` mientras su par pumpfun cargaba `23.93 / -1.58 / 0 / 1`; el fan-out solo corría para quotes no-USD/SOL, que el gate de clase silencia ⇒ la fila `5M` era INALCANZABLE en producción. Fix: módulo puro `provider/infrastructure/dexscreener/pumpfun-5m.ts` (`isUsdOrSolQuoteSide` + `readPumpfun5m`) compartido por el fetcher y el fast path; el fast path cosecha el summary de discovery que YA había pedido (CERO red extra).

**Evidencia de staging (post-deploy, `:4001`).**

| Fixture                                        | Quote                    | Resultado                                                                                                        |
| ---------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `6V2BdbXfJy6ukLXjC4SRP1YF8fhAoyQPP3i3fVVXpump` | SOL, on curve, fast path | `694.49 / -61.97 / 19 / 16` VERBATIM (upstream `m5 -61.97`) — fila `5M` viva                                     |
| `FXRorC4nBg7emCPCcrKqvqNuBAw4Bo6hPL9S5JxPpump` | SOL, on curve, fast path | `0 / null / 0 / 0`: el bucket rodó a cero upstream, el `0` real SOBREVIVE y la fila calla porque falta el cambio |
| `3tnDcNaqqxrXm6FnZAFYraRUJPp5JjekUK58RmLKpump` | ZEC, on curve            | los cuatro `null` (upstream publica `-8.93 / 154.7 / 1 / 4`) — silencio por CLASE                                |
| `2dNdT2gD…BTC` (referencia)                    | Bitcoin, on curve        | `quoteSymbol: 'Bitcoin'`, `progressPercent 62.573`, los cuatro `null`                                            |
| `2o1wthqgE…pump` (CHALE)                       | graduado                 | `bondingCurve: null`                                                                                             |

**DEFECTO de composición encontrado por el preview (`:4061`, draft-only).** `market5mRow`/`marketRow` emitían la fila DESNUDA (mirror de `market1hRow`, cuyo contrato es "sin whitespace: los separadores son del template"), así que el body v17 las PEGABA a la línea anterior: `📊 Vol: 692 ⋅ Age: \`3m\`📉 5M: …`y, en tarjeta completa,`💦 Liq: \`147.9K\`📉 1H: …`. Poner un `\n`en el body NO sirve: cuando la fila calla (referencia, cualquier token sin ventana) queda una LÍNEA EN BLANCO — el mismo fallo que el body documenta para las keys que empiezan con`\n`. Fix: ambas keys bajan su propia línea (`"\n" + fila`cuando renderizan,`""`al callar — la mecánica de`usdRow`/`liqRow`/`curveRow`). Bytes de la FILA sin cambios (pinneados), `market1hRow`intacta (key legacy, sin`\n`), body v17 byte-idéntico. Pin end-to-end: `template-renderer-bonding-curve.spec.ts` §"v17 body composition" (curva+5m / curva sin 5m / fuera de curva / silencio). Verificación dexter: tsc 0, jest 86 suites / 1062 tests, eslint 0.

**Render final v17 (staging `:4061`).** Evidencia completa (tabla de probes + los seis renders + residuales): `.omo/evidence/rick-compact-card-v17-preview-20261030.log` (gitignored por diseño).

```
🟣 NETCOIN *$NET/Bitcoin*
🌐 Solana
💎 FDV: 15\.9K ⇨ 15\.9K \[4h\]
📊 Vol: 2
⏳ 62\.6% @ Pump
```

```
🟣 TRUMP THA DON *$trump*
🌐 Solana @ Pump\.fun
💎 FDV: 2\.1K ⇨ 7\.1K \[3m\]
📊 Vol: 692 ⋅ Age: `3m`
📉 5M: `694` ⋅ `-62%` 🅑 `19` Ⓢ `16`
⏳ 0% @ Pump
```

Fuera de curva (Bonk, no-pump) y graduado (CHALE): tarjeta completa con `💰 USD` / `💦 Liq` y la fila `1H` en su propia línea. **Residual:** un token servido por el fast path cuyo mejor par no sea el pumpfun conserva los cuatro 5m en `null` (el fast path no gasta la llamada extra de pair-list); tipicamente está fuera de curva o tiene quote no-USD/SOL, donde la fila calla igual.
