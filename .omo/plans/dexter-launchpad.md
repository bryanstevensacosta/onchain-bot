# dexter-launchpad

## Status

- [x] Drafted (2026-10-02, iterado con owner, sin codigo)
- [x] Approved
- [x] Spike R1 — research profunda Solana extendida + EVM (con URLs + emojis propuestos)
- [x] Wave 1 — detector + plumbing + renderer + seeds (todas las chains del R1)

## TL;DR (For humans)

**What you'll get:** Cuatro placeholders nuevos (`{{launchpadText}}`, `{{launchpadTextLink}}`, `{{launchpadIcon}}`, `{{launchpadIconLink}}`) que muestran el launchpad ORIGEN del token (nunca el venue actual, persiste tras graduar) con emojis estilo Rick clicables — en Solana extendida Y EVM desde el dia uno.

**Why this approach:** Deteccion on-chain determinista (gratis, sin keys) como fuente primaria en ambas VMs (PDAs en Solana, factories/deployer en EVM); DisplayMap existente para los emojis (cero infra nueva de mapeo); el renderer compone las 4 variantes desde un solo campo nullable.

**What it will NOT do:** No condicionales en templates; no cambia el venue (`dexId` sigue intacto para eso); no cubre TRON/SunPump (otra VM) salvo que el research lo regale; no migraciones en prod sin tu OK (si hiciera falta alguna).

**Effort:** Large (research amplia + detector multi-chain + 4 keys + seeds + tests)
**Risk:** Medium — la deteccion tiene matices reales (infra compartida Meteora, rebrands, launchpads muertos); el diseno los absorbe con orden-documentado + status flags + nullable. Sin launchpad detectado todo renderiza como hoy.
**Decisions to sanity-check:** nombres finales `Text/TextLink/Icon/IconLink` · degradacion `IconLink→Link` sin emoji · nombre canonico = marca oficial, mapa claveado por `id` slug · emojis propuestos para los NUEVOS (tu veto) · lista cerrada tras R1 (incluir/excluir dudosos: DAOs.fun, Heaven, Moonit, Zora).

Your next move: aprueba (o ajusta) — al aprobar se ejecuta el spike R1 primero y se te presenta la tabla antes de implementar.

---

## Scope

### Must have

- **Spike R1 (research profunda web + on-chain, sin codigo productivo):** tabla cerrada con el owner antes de implementar. **Solana (Rick 8 + extension):** pump-fun, meteora-dbc, raydium-launchlab, bags, letsbonk (rebranded BONK.fun — verificar nombre canonico), moonit (ex-Moonshot — OJO maintenance page desde Aug 2026, flag de status), boop, heaven (OJO $0 fees — posible muerta, flag), + Jupiter Studio, GoFundMeme, Believe, DAOs.fun (modelo hedge-fund sin graduacion — R1 dictamina incluye/excluye). Por cada uno: program ID + seeds PDA + metodo de chequeo (`getMultipleAccounts` batch) + URL template + nota de graduacion + status (vivo/moribundo/muerto) + emoji (Rick 8 fijos; NUEVOS propuestos por el worker, veto del owner). **MATIZ CRITICO a resolver en R1 (verificado web 2026-10-02): infra compartida** — Jupiter Studio, jups.fun, Bags y Believe corren SOBRE Meteora DBC; el chequeo generico `meteora-dbc` tragaria a los especificos. R1 debe definir el ORDEN de chequeo (marca especifica ANTES que infra generica) y el metodo de distincion (creator/integrator/referral, registry del frontend, o marca en la pool) por caso, o colapsarlos a `meteora-dbc` con decision documentada. Meteora Alpha Vault NO es launchpad (add-on anti-bot) — no es entrada propia. **EVM (mismo spike):** Clanker, Zora (OJO modelo creator-coin supuestamente abandonado Feb 2026 — flag), Virtuals, Flaunch, Bankr, Four.meme (BNB), GraFun (multichain), PinkSale/DxSale (presale factories — las MAS faciles: factory addresses conocidas por chain + PinkLock), Mint Club, OpenServ, **Pons (Robinhood Chain — caso trivial owner `0x6a57...635F2d`: R1 debe resolver RPC + factory contracts de Robinhood Chain, chain sin endpoint publico conocido en Base/BSC/ETH — `eth_getCode` vacio en las 3 verificado 2026-10-02)**. Por cada uno: chain(s), metodo (factory/deployer `to` de tx de creacion; receipt vs trace), URL template, emoji propuesto, status. **TRON/SunPump: OUT** (otra VM, sin RPC EVM/Solana que lo cubra) salvo que R1 demuestre costo ~0. Fuentes: docs oficiales + program IDs / factory addresses verificados on-chain (nunca de memoria); pump.fun `/coins/<mint>` gratis como referencia de enriquecimiento opcional. Output: tabla en notepad + URLs probadas + casos live (CHALE → `pump-fun` obligatorio).
- **Regla de links Rick (CONFIRMADA docs+live 2026-10-02, cierra las anomalias):** docs Rick: "🟡 - default emoji" + fila "💹 Chart: DEX⋅DEF" (DEX = pagina del PAR primario, DEF = pagina del token). Casos resueltos: `JUPyiwr...` = token OFICIAL Jupiter/JUP (1 par `orca` `C1MgLoj...` = la URL "distinta" — par primario, no otro mint; sin launchpad → 🟡 correcto = nuestro `null`) · `0x9251...` = token OFICIAL Huma Finance/HUMA en BSC (PancakeSwap, par `0x7874...` = la URL "distinta"; sin launchpad → 🟡 correcto = nuestro `null`). La hipotesis multichain del owner no hizo falta: son team-launches sin launchpad, y ahi `null` es CORRECTO (la navegacion al par ya la cubre `scanLinks`). "WP" en `Solana @ Orca WP` = Whirlpool con alta probabilidad (namespace `wp_` del SDK Orca; granularidad pool-type en la linea venue).
- **Regla fallback de URL refinada:** launchpad conocido CON pagina por token → esa pagina (pump.fun, ponsfamily, stonkfun, flap, raydium launchpad) · conocido SIN pagina propia → `https://defined.fi/token/<chain>/<address>` (caso Meteora) · desconocido/`null` → SIN icono (navegacion por `scanLinks` existentes). R1 la valida por launchpad.
- **Casos triviales owner (evidencia Rick 2026-10-02, verificados live):**
  - NUEVOS launchpads: `pons` (Robinhood Chain, 🅿️, URL `https://ponsfamily.com/launchpad/<address>` — 308 verificado) · `stonkfun` (Solana, 💸, URL `https://www.stonkfun.xyz/token/<mint>` — 200 verificado, venue actual `raydium`) · `flap` (Flap.sh, 🦋, URL `https://flap.sh/<address>` — 200 verificado; chain a confirmar: Base probable).
  - NUEVAS chains: `unichain`, `robinhood` (ambas con caso 🟡 → fallback dexscreener).
  - `raydium-launchlab`: caso `6e8LLH...UNg937` con URL `https://raydium.io/launchpad/token/?mint=<mint>` + venue actual `raydium` (graduado, origen persiste — 2da confirmacion decision 1 junto a Stonk).
  - 🟡 = launchpad DESCONOCIDO para Rick → link a dexscreener `/<chain>/<address>` (NO defined.fi — salvo el caso Meteora que apunto a defined.fi; R1 resuelve la regla exacta: ¿defined.fi para DBC con pool vivo vs dexscreener para desconocidos?).
  - ANOMALIAS RESUELTAS 2026-10-02 (ver edicion de regla confirmada arriba): JUP+ HUMA identificados; caso Robinhood `0x6457...7234A` CONFIRMADO por owner con bloque completo: token **Arvo**, venue `Robinhood @ Virtuals`, emoji URL = par primario `0xb9b1...`, DEF = token en defined.fi. MISMA regla. HALLAZGO MAYOR: **Virtuals opera en Robinhood Chain** y Rick le pone 🟡 (Virtuals NO esta en sus 8) → nuestro detector debe resolver `virtuals` donde Rick muestra generico (ventaja + calibracion: el emoji Rick NO es ground truth en EVM). TH link (`0x13a4...`, identidad no resuelta) sin impacto en diseno.
  - COLAPSO-INFRA CONFIRMADO 2026-10-02 (caso owner Jupiter Studio `8xdY...Gjupx` JAMES EAST/$JAMES, estado `new`): Rick muestra ☄️ + defined.fi (NO hay emoji/marca Jupiter) y DexScreener dice venue `meteoradbc` par `EsJvak...`. Un launch de Jupiter Studio es indistinguible a nivel venue de Meteora DBC generico. Decision para R1: distinguir SOLO si encuentra marcador (creator/integrator/referral, registry jups.fun) — si no, colapsar a `meteora-dbc` documentado (paridad Rick). Mismo tratamiento para Bags/Believe/jups.fun salvo marcador. Estados Jupiter (`new`/`soon`/`bonded` = ciclo pre/post-graduacion) NO entran al detector (metadata de ciclo, no identidad). Higiene: nuestros links SIN params `?ref=` (Rick firma los suyos).
  - BELIEVE DOCUMENTADO (CoinGecko May-2025 + fixtures): launches via backend Believe (reply X → deployer = wallet(s) backend Believe) = VIA DE DISTINCION contra `meteora-dbc` generico: creator == deployer Believe (no la pool). Gradua a Meteora a $100k mcap (vs $69k pump→PumpSwap). Fixtures R1 con pools: DUPE `2vh4287i...X4P`, NOODLE `5b8n8V6d...qngUR`, YAPPER `ARwzSvwh...WBf5usA` (+ LAUNCHCOIN). REGLA DURA: Believe permite metadata MUTABLE post-launch (nombre/ticker cambian) → el detector NUNCA clavea por name/symbol (solo mint/creator/pool). Que sigo pidiendo: 1 address live de Rick (Believe) para el caso trivial.
  - PUMP SIN GRADUAR (caso owner `CQTrfd...wesDpump` chloz/€Zs 2026-10-02): emoji 🆕💊 (= new <15min + pump.fun segun docs), URL `pump.fun/<mint>` directa, venue `⏳ 1% @ Pump Mayhem` (layout launchpad-scans: progreso de bonding + launchpad). DexScreener: `dexId: pumpfun`, 1 solo par (`vKXvFP2...`) = origen==venue pre-graduacion. Fixture canonico del caso pre-graduado (contrasta con CHALE graduado→pumpswap). TOKEN ABIERTO para R1: que es "Mayhem" en la linea venue (¿board/evento de pump.fun?) — no afecta deteccion, solo documentarlo.
  - PINKSALE PRESALE (caso owner `0x1c15...1949a1` PyramidCoin/PYRD en Polygon 2026-10-02): presale ACTIVA (30-sep→07-oct, lista en QuickSwap, lock 365d) + pool `0xcc0d...`. DexScreener: **0 pares** (no listado aun) = prueba de que el detector DEBE funcionar sin market data (sin pares, precio ni DexScreener): firma `detectLaunchpad(chain, address)` pura, sin depender del snapshot. Vias R1: patron presale-contract/factory por chain + PinkLock + API publica PinkSale si existe. Metadata de presale (softcap, fechas, lock, listing) FUERA de scope v1 (sin placeholders de presale-stats).
  - FOUR.MEME (caso owner `0x7dac...70ffff` 4%/BNCB en BNB 2026-10-02): emoji 🍀 (NUEVO) → URL propia `https://four.meme/en/token/<address>` + venue `⏳ 13% @ FourMeme on BNB` (confirma formato venue con red para no-Solana, segun docs) + DEX `dexscreener/bsc/<mint>:4meme` (qualifier de pool propio, como `:bpool`) + DEF `defined.fi/token/bsc/<mint>`. DexScreener: `dexId: fourmeme`, 1 par = origen==venue pre-graduacion. Anatomia Rick completa en 1 caso (emoji-link + venue-line + DEX/DEF).
  - BANKR-VIA-CLANKER-V4 (caso owner `0x86Cd...2Ab07` ConwayResearch/$Conway en Base 2026-10-02, tomado de Bankr por el owner): ORIGEN = `bankr`, venue-tech = pool V4 estilo Clanker/Doppler (`Base @ Clanker V4`, DexScreener `dexId: uniswap`, par `0xae11...`). Es el colapso-infra en EVM (gemelo de Jupiter Studio→Meteora DBC): la marca es Bankr, la tuberia es V4. R1: via de distincion Bankr (deployer/factory Bankr, fee-recipients 43% Bankr, registry/API bankr) — si no hay marcador barato, documentar limite (venue-tech visible, origen aproximado). Rick 🟡 en ambos casos (ni Bankr ni Clanker en sus 8) → ventaja competitiva + calibracion EVM intactas.
  - BONK.FUN 0% (caso owner `GSfptuk...zVLrn` Balltze/$BALLTZE 2026-10-02): emoji 🐶 → URL propia `https://www.bonk.fun/token/<mint>` + venue `⏳ 0% @ Bonk` (recien lanzado, sin trades). DexScreener: **0 pares** = 2da confirmacion independencia-de-market-data (tras PinkSale). Nombre canonico a cerrar en R1: venue dice `@ Bonk` (marca actual BONK.fun/Bonk.fun — decidir `name` exacto).
- **Wave 1 — implementacion (todo lo del R1 aprobado):**
  - `LaunchpadDetector` (market-data): `detectLaunchpad(chain, address): Promise<LaunchpadInfo | null>` — estrategias por VM (PDAs Solana batch unico; factories EVM), ORDEN documentado (especifico-antes-que-infra), timeout+degradacion a `null` (nunca revienta el snapshot). `LaunchpadInfo{id: slug, name: marca oficial, url: string}`.
  - Plumbing: `snapshot.launchpad` (+ `lookup` si aplica) → `ResolvedToken.launchpad?` en dexter (fluye como holders/FDV; sin migraciones: campo en respuesta, no en DB).
  - Renderer (`placeholders/`): 4 claves derivadas `launchpadText` (name), `launchpadTextLink` (`[name](url)`), `launchpadIcon` (emoji via DisplayMap `placeholderKey='launchpad'`, fallback `""`), `launchpadIconLink` (`[emoji](url)` con emoji, cae a `Link` si falta emoji). `null` global → las 4 en `""` (+ limpieza de separadores existente). Registry: lista blanca (las 4, todos los comandos con ResolvedToken).
  - DisplayMap seeds: N filas `(launchpad, <id>, <emoji>)` via API/seed (operador; documentar comando exacto; emojis nuevos con veto owner).
  - Tests: detector (PDAs/factories mockeadas: match/orden/infra-colapso/null/timeout) + renderer (4 variantes, fallback IconLink→Link, null→"", snapshot CHALE real) + registry (whitelist) + e2e frontend (preview con `{{launchpadIconLink}}` mockeado).
  - Docs: AGENTS dexter (campo + 4 claves + tabla launchpads soportados con status) + CHANGELOG dexter + frontend (catalogo las lista solo).

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO usar `dexId`/venue como launchpad (origen ≠ venue; `dexId` intacto para su proposito).
- NO heuristica del sufijo `...pump` como unica fuente (falsable; como mucho fast-path documentado tras PDA).
- NO condicionales en templates para ramificar por launchpad (para eso existen las 4 variantes).
- NO nombre en el DisplayMap (el mapa solo aporta emoji; identidad = detector).
- NO TRON/SunPump (otra VM) salvo que R1 demuestre costo ~0; la decision queda citada en el notepad.
- NO tocar `apps/backend/**`, gateway, `.kiro/`; sin secretos en git; sin migraciones prod sin OK.
- NO `git reset --hard` / force-push; ramas `feat/*` + PR.

---

## TODOs

- [x] 0. Spike research profunda Solana extendida + EVM (con URLs, emojis propuestos y status flags)
     What to do / Must NOT do: Producir la tabla cerrada (Scope Must have: criterios R1) con FUENTES citadas por fila (docs oficiales, explorers, program IDs / factory addresses verificados on-chain — nunca de memoria). Probar deteccion contra CHALE (`2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump` → `pump-fun`) + al menos 1 caso Meteora-infra (Bags o Believe → distingue marca especifica vs `meteora-dbc` generico) + 1 caso EVM facil (PinkSale factory o Clanker, lo que resuelva primero). Resolver: rebrands (BONK.fun, Moonit), status (Heaven/Moonit/Zora flags), DAOs.fun incluye/excluye con motivo, colapso infra (orden o colapso documentado), emojis propuestos para entradas nuevas. Cero codigo productivo (scripts desechables si, commitear ninguno). Presentar tabla al owner ANTES de Wave 1 (gate).
     References: `apps/market-data/src/provider/infrastructure/solana-rpc/solana-rpc.service.ts` (capacidades Solana), Moralis/Alchemy/FluxRPC adapters (capacidades EVM), `https://docs.rick.bot/features/pricebot#scan-icons` (lista de referencia, NO fuente de program IDs).
  - COBERTURA SUFICIENTE 2026-10-02 (owner): casos triviales cubren pump-fun (pre+post), meteora-dbc, LaunchLab-graduado, Stonk-graduado, BONK-fun-0%, Four.meme, Pons, Flap, Stonk, Jupiter-colapso, PinkSale-presale, JUP-null, HUMA-null, Arvo/Virtuals-Robinhood, Bankr-via-V4, Conway. Launchpads sin caso aun (GoFundMeme, Boop, Bags, Virtuals-Base, JAMES-bonded, resto EVM) entran en OTRA SESION via regla de intake: owner pasa address + bloque Rick completo → verificar live → extender tabla R1 (re-abre R1 parcial, no Wave 1).
    Acceptance criteria: tabla N filas (N cerrado con owner) 100% verificadas on-chain + casos triviales live OBLIGATORIOS: CHALE (`2o1wth...Ppump` → `pump-fun`), `6bzbi...Uputer` (→ `meteora-dbc`, venue `meteoradbc` corroborado via DexScreener 2026-10-02) + 1 Meteora-infra (Bags o Believe → distingue marca especifica vs `meteora-dbc` generico) + 1 EVM facil (PinkSale factory o Clanker) + `0x6a57...635F2d` (→ Pons/Robinhood Chain, requiere resolver RPC + factory de Robinhood Chain en R1) + NULL-fixtures (JUP oficial y HUMA oficial deben dar `null`, verificado 2026-10-02) + URLs verificadas o TBD-con-dueno + emojis nuevos propuestos.
    Gate R1 (hallazgo review 2026-10-02, OBLIGATORIO antes de Wave 1): la tabla sale como array ORDENADO ejecutable (marcas especificas ANTES que infra generica, colapsos como dato) + prueba cero-market-data en los fixtures 0-pares (PinkSale `0x1c15...`, BONK-fun `GSfptuk...`) + URL canonica pump.fun `/coin/<mint>` (redirect 308 verificado, pinnear forma canonica en `LaunchpadInfo.url`).
    QA scenarios: scripts desechables con salidas capturadas. Evidence .omo/evidence/task-dex-launchpad-r1.log
    Commit: N (research; tabla al notepad)
- [x] 1. Detector + plumbing + renderer + seeds + tests (Wave 1)
     What to do / Must NOT do: Segun Scope Wave 1 (todas las chains del R1 aprobado). Orden detector documentado (especifico-antes-que-infra), batch unico por VM, `null` ante cualquier fallo. Registry + 4 claves + DisplayMap seeds documentadas (comando API exacto para las N filas). INCLUYE micro-infra hallada en review (no es cero-trabajo): (a) admitir dimension `launchpad` en `DISPLAY_PLACEHOLDER_KEYS`/validators del DisplayMap; (b) anadir `getMultipleAccounts` batch a `solana-rpc.service.ts` (~20 lineas, hoy solo existe `getAccountInfo` + roadmap en README); (c) seeds Wave-1 SIN labels hardcodeados adyacentes a las 4 claves (o extender `cleanupDanglingSeparators` — decision del worker con spec). Tests + docs (dexter AGENTS/CHANGELOG; frontend catalogo automatico + linea docs si aplica; gate frontend AGENTS+CHANGELOG si toca `apps/frontend/`).
     Parallelization: Wave 1 (detector-solana | detector-evm | renderer+registry | seeds+tests+e2e) | Blocked by: R1 (tabla aprobada por owner) | Blocks: —
     References: `apps/market-data/src/provider/infrastructure/solana-rpc/` (transporte Solana) + adapters EVM (transporte EVM), `apps/market-data/src/snapshot/` + `lookup` (donde colgar el campo), `apps/dexter-onchain-bot/src/scan/domain/ports/scan-pipeline.port.ts:31-54` (ResolvedToken a extender), `src/placeholders/` (registry+renderer+DisplayMap `placeholderKey`), seeds CHALE como fixture.
     Acceptance criteria: `npx tsc --noEmit` + full `npm test` verdes en market-data Y dexter-onchain-bot (+ frontend si lo roza); CHALE → `{id:'pump-fun', name:'Pump.fun', url:'https://pump.fun/2o1...pump'}` live; 1 caso EVM live; no-launchpad → 4 claves en `""`; e2e preview con `{{launchpadIconLink}}` verde.
     QA scenarios: happy (launchpads con fixtures, pump.fun + 1 EVM live minimo) + failure (timeout RPC→null, mapa sin fila→fallback, token sin launchpad). Evidence .omo/evidence/task-dex-launchpad-w1.log
     Commit: Y | feat(dexter-launchpad): detector multi-chain + 4 placeholders (docs segun gate)

### Final Verification Wave

- [x] F1. Plan compliance audit (R1+Wave 1)
- [x] F2. Code quality review (detector + renderer + registry)
- [x] F3. Real manual QA (`{{launchpadIconLink}}` contra CHALE live + 1 graduado Raydium/PumpSwap)
- [x] F4. Scope fidelity (venue intacto, sin backend/gateway, sin secretos)

---

## Verification strategy

- Test decision: research con evidencia on-chain citada (R1) + TDD/tests-after en codigo (unit PDAs/factories mockeadas + renderer + registry + e2e). Todo con QA de agente (happy + failure + evidencia en `.omo/evidence/task-dex-launchpad-*.log`).
- Evidence: gitignored, solo local.

## Execution strategy

### Parallel execution waves

- R1 (research, 1 worker + gate owner) → presentar tabla al owner → Wave 1 (4 lanes) → F1-F4.

### Dependency matrix

| Todo       | Depends on         | Blocks | Can parallelize with |
| ---------- | ------------------ | ------ | -------------------- |
| 0 research | —                  | 1      | —                    |
| 1 Wave 1   | 0 (tabla aprobada) | —      | lanes internas si    |

## Commit strategy

- Un commit por unidad (research no commitea codigo; Wave 1 atomico por area). Prefijos `feat(dexter-launchpad)`. Ramas `feat/*` + PR. Push por wave. Sin `reset --hard`/force.

## Success criteria

- [x] CHALE renderiza `[💊](https://pump.fun/2o1...pump)` via `{{launchpadIconLink}}` en vivo + 1 caso EVM live.
- [x] Token sin launchpad: las 4 claves en `""`, card intacta.
- [x] Tabla R1 N/N verificada on-chain con fuentes; URLs TBD documentadas con dueno; emojis nuevos con veto owner.
- [x] Cero regresiones (suites verdes market-data + dexter + frontend si roza).
