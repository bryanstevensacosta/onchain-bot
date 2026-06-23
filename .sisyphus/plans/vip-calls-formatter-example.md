# Plan: Formatter VIP con formato example.md (versión simplificada)

## TL;DR

> **Quick Summary**: Implementar `VipCallsMessageFormatterAdapter` con el formato simplificado de `example.md` (solo MC, contract, dexscreener, 9 botones inline).

> **Deliverables**:
> - `VipCallsMessageFormatterAdapter` con formato example.md simplificado
> - `formatKeyboard()` con 9 botones (3 filas x 3 columnas)
> - `chain/explorer` consolidado (1 BC en lugar de 2)

> **Estimated Effort**: Short
> **Parallel Execution**: NO - tareas secuenciales
> **Critical Path**: 1 → 2 → 3

---

## Context

### Original Request
- "ahora en el formato solo quiero esto example.md he actualizado el formato en example.md lo quiero como ese"

### Formato objetivo (example.md versión simplificada)

```
$CHAIN | **SYMBOL**

MC: `554.33M`

`BCNSwbxk5q25UFU1oLYTd25MQVTq9NNPRHxoxjPgpump`

🦅 (Dexscreener)[https://...]

**Quick Buy:**
🔺 Axiom | ☀️ Photon | 🔍 GMGN
💊 Padre | 🤖 Maestro | 🍌 Banana
🏛️ Trojan | 🟦 Based | ✳️ Sigma

Chain emoji:
🟣 $SOL 
🔵 $BASE
🔴 $TRX
🟡 $BSC
🔷 $ETH 
₿ $BTC
🔵🌊 $SUI
🟠 $AVAX
💊 $SOL PUMPFUN 
```

### Cambios vs plan anterior

**Eliminado:**
- Tabla completa de Token Info (FDV, ATH, USD, LIQ, VOL, 1H, HOLDERS, Top 10, Top 20, Locked, Burned)
- Socials (X, Website, Telegram)
- Chain emoji completo (mantenemos solo los más comunes)

**Agregado:**
- 9 botones inline (3 filas x 3 columnas):
  - Fila 1: Axiom | Photon | GMGN
  - Fila 2: Padre | Maestro | Banana
  - Fila 3: Trojan | Based | Sigma

**Consolidado (mantener):**
- `chain/explorer` absorbe `token/market-data` (un solo BC para data layer)

---

## Work Objectives

### Core Objective
Implementar formatter VIP con formato example.md simplificado y consolidar data layer en un solo BC.

### Concrete Deliverables
1. `VipCallsMessageFormatterAdapter` con formato example.md
2. `formatKeyboard()` con 9 botones inline
3. `chain/explorer` consolidado (absorbe `token/market-data`)

### Must Have
- Formato exacto según example.md versión simplificada
- 9 botones inline (3x3) con URLs de trading
- MC formateado (554.33M, 1.5B, etc.)
- Chain emoji antes del ticker

### Must NOT Have
- Tabla completa de market data (eliminar del plan anterior)
- Socials links (eliminar)
- Top holders, ATH, locked, burned (eliminar del formatter)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: Jest

### QA Policy
- Build compila sin errores
- Formato de salida coincide con example.md
- 9 botones inline en 3 filas

---

## Execution Strategy

### Tareas (3 waves, sequential)

```
Wave 1: Consolidación (chain/explorer absorbe token/market-data)
├── 1.1: Mover enrich-token.use-case.ts a chain/explorer
├── 1.2: Actualizar imports en consumers
└── 1.3: Eliminar token/market-data

Wave 2: Formatter VIP
├── 2.1: Implementar VipCallsMessageFormatterAdapter formato example.md
└── 2.2: Implementar formatKeyboard() con 9 botones

Wave 3: Test
├── 3.1: Build
├── 3.2: curl test
```

---

## TODOs

### Wave 1: Consolidación (chain/explorer absorbe token/market-data)

- [x] 1.1 Mover enrich-token.use-case.ts a chain/explorer

  **What to do**:
  - Mover `token/market-data/application/handlers/enrich-token.use-case.ts` → `chain/explorer/application/handlers/`
  - Mover `InMemoryTokenSnapshotRepository`
  - Mover eventos (`TokenEnrichedEvent`, `EnrichmentFailedEvent`)
  - Mover `CallNormalizedHandler`
  - Mover `InProcessEnrichmentEventPublisher`

  **References**:
  - `apps/backend/src/token/market-data/` - origen
  - `apps/backend/src/chain/explorer/chain-explorer.module.ts` - destino

  **Acceptance Criteria**:
  - [ ] enrich-token.use-case vive en chain/explorer
  - [ ] Todos los archivos related movidos

- [x] 1.2 Actualizar imports en consumers

  **What to do**:
  - Buscar y reemplazar imports de `token/market-data` → `chain/explorer`
  - Verificar: classification, scoring, filters, controllers

  **Acceptance Criteria**:
  - [ ] Todos los imports actualizados
  - [ ] Build compila sin errores

- [x] 1.3 Eliminar token/market-data

  **What to do**:
  - Remover import de `token/market-data` en app.module.ts
  - Eliminar directorio `token/market-data/`

  **Acceptance Criteria**:
  - [ ] Solo existe chain/explorer para data layer

### Wave 2: Formatter VIP

- [x] 2.1 Implementar VipCallsMessageFormatterAdapter formato example.md

  **What to do**:
  - Reescribir `format()` method para producir:
    ```
    $CHAIN | **SYMBOL**
    
    MC: `554.33M`
    
    `contract_address`
    
    🦅 (Dexscreener)[https://...]
    ```
  - Chain emoji mapping:
    - 🟣 $SOL
    - 💊 $SOL PUMPFUN (si address ends con "pump")
    - 🔵 $BASE
    - 🔴 $TRX
    - 🟡 $BSC
    - 🔷 $ETH
    - ₿ $BTC
    - 🔵🌊 $SUI
    - 🟠 $AVAX

  **References**:
  - `apps/backend/src/telegram-publishing/vip-calls/infrastructure/formatters/vip-message-formatter.adapter.ts`
  - `example.md` lines 1-7

  **Acceptance Criteria**:
  - [ ] Output coincide con example.md

- [x] 2.2 Implementar formatKeyboard() con 9 botones

  **What to do**:
  - Fila 1: 🔺 Axiom | ☀️ Photon | 🔍 GMGN
  - Fila 2: 💊 Padre | 🤖 Maestro | 🍌 Banana
  - Fila 3: 🏛️ Trojan | 🟦 Based | ✳️ Sigma
  - URLs dinámicas por bot con contract address

  **URLs templates:**
  - Axiom: `https://axiom.trade/t/{chain}/{address}`
  - Photon: `https://photon-sol.tinyastro.io/@{address}`
  - GMGN: `https://gmgn.ai/?ref=ref&chain={chain}&token={address}`
  - Padre: (Solana) `https://padre.gg/t/{address}`
  - Maestro: `https://t.me/MaestroBot?start={address}`
  - Banana: `https://t.me/BananaGun_bot?start={address}`
  - Trojan: `https://t.me/TrojanBot?start=ref_{address}`
  - Based: (Base) `https://t.me/BasedBot?start={address}`
  - Sigma: `https://t.me/SigmaTradingBot?start={address}`

  **References**:
  - `example.md` lines 9-12

  **Acceptance Criteria**:
  - [ ] 9 botones en 3 filas
  - [ ] URLs con contract address dinámico

### Wave 3: Test

- [x] 3.1 Build

  **What to do**:
  - `npm run build --workspace=apps/backend`

  **Acceptance Criteria**:
  - [ ] Build pasa sin errores

- [x] 3.2 Integration test

  **What to do**:
  - Start dev server
  - curl -X POST http://localhost:3030/vip-calls/publish con datos de prueba

  **QA Scenarios**:

  Scenario: Full data
    Tool: Bash (curl)
    Steps:
      1. Start dev server
      2. curl -X POST http://localhost:3030/vip-calls/publish -H "Content-Type: application/json" -d '{"chain":"solana","address":"BCNSwbxk5q25UFU1oLYTd25MQVTq9NNPRHxoxjPgpump","ticker":"TOKEN","score":85,"classification":"STRONG","marketCapUsd":554330000,"chart":"https://dexscreener.com/solana/BCNSwbxk5q25UFU1oLYTd25MQVTq9NNPRHxoxjPgpump"}'
    Expected Result: 
      - Header: 🟣 $SOL | **TOKEN**
      - MC: $554.33M
      - Contract en quote
      - Dexscreener link
      - 9 botones inline

  Scenario: Pump.fun token
    Steps:
      1. curl con address ending en "pump"
    Expected Result:
      - Header: 💊 $SOL PUMPFUN | **TICKER**

---

## Final Verification Wave

- [x] Build compila sin errores
- [x] Formato de salida coincide con example.md
- [x] 9 botones inline (3x3)
- [x] Chain emoji correcto

---

## Commit Strategy

- Commit 1: `refactor(consolidate): merge token/market-data into chain/explorer`
- Commit 2: `feat(vip-calls): format messages with example.md layout`
- Commit 3: `feat(vip-calls): add 9 quick-buy inline buttons`

---

## Success Criteria

```bash
npm run build --workspace=apps/backend  # PASS
curl -X POST http://localhost:3030/vip-calls/publish ...  # Formato example.md
```
