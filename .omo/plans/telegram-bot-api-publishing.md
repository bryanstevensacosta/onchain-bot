# Plan: Telegram Bot API para Publicación

## TL;DR

> **Quick Summary**: Reemplazar el mock sender con un adapter que use Telegram Bot API (HTTP) para enviar mensajes al canal de output. MTProto sigue solo para lectura.
> 
> **Deliverables**:
> - Nuevo `BotApiTelegramPublisherAdapter` 
> - Channel ID configurable en `.env`
> - Publicación funcional al canal `-1004485692803`
> 
> **Estimated Effort**: Short
> **Parallel Execution**: NO - sequential
> **Critical Path**: Config → Adapter → Wiring → Test

---

## Context

### Original Request
- Un solo canal de output
- Bot token para envío (no MTProto)
- MTProto solo para lectura/ingestión (cumplimiento ToS)

### Interview Summary
- **Canal**: ID 4485692803 → `-1004485692803` para API
- **Bot Token**: `TELEGRAM_BOT_TOKEN` ya en `.env`
- **Canal actual hardcodeado**: `OnChainAlphaBot`, `SpyDefiCalls`, `AlphaPremiumHub` (se reemplaza)

### Metis Review
- **No aplica** - cambio simple y bien definido

---

## Work Objectives

### Core Objective
Implementar publicación de alpha-calls via **Telegram Bot API** (HTTP) en lugar de MTProto.

### Concrete Deliverables
1. `BotApiTelegramPublisherAdapter` en `infrastructure/senders/`
2. Channel ID configurable via `PUBLISHING_TELEGRAM_OUTPUT_CHANNEL`
3. Pipeline completo: filters → format → send → persist

### Definition of Done
- [ ] POST a `/telegram-publishing/publish` envía mensaje real al canal
- [ ] Logs muestran "sent to -1004485692803" con message_id
- [ ] No se usa MTProto para envío

### Must Have
- Envío via Bot API (HTTP POST a api.telegram.org)
- Manejo de errores (rate limits, red)
- Message splitting si > 4096 chars

### Must NOT Have
- MTProto para envío (viola ToS)
- Múltiples canales (v1: uno solo)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Jest)
- **Automated tests**: Tests-after
- **Framework**: Jest
- **Agent-Executed QA**: ALWAYS

### QA Policy
Escenario de verificación:
- Enviar un call aprobado y verificar que llega al canal de Telegram
- Capturar evidencia (logs con message_id)

---

## Execution Strategy

### Tasks

**Task 1: Crear BotApiTelegramPublisherAdapter**
- Ubicación: `infrastructure/senders/bot-api-telegram-publisher.adapter.ts`
- Implementa `TelegramPublisherPort`
- Usa `TELEGRAM_BOT_TOKEN` + `PUBLISHING_TELEGRAM_OUTPUT_CHANNEL`
- HTTP POST a `https://api.telegram.org/bot{TOKEN}/sendMessage`

**Task 2: Agregar config de canal**
- En `app.config.ts`: `publishing.telegram.outputChannel`
- En `.env`: `PUBLISHING_TELEGRAM_OUTPUT_CHANNEL=-1004485692803`

**Task 3: Actualizar publishing.module.ts**
- Cambiar factory para usar `BotApiTelegramPublisherAdapter` en lugar de mock
- Remover `MtprotoPublishingAdapter` de la factory (no se usa para publicación)

**Task 4: Testear**
- Llamar endpoint `/telegram-publishing/publish` con datos de prueba
- Verificar logs con message_id

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
- [ ] F2. **Code Quality Review** — `unspecified-high`
- [ ] F3. **Real Manual QA** — `unspecified-high`
- [ ] F4. **Scope Fidelity Check** — `deep`

---

## Commit Strategy

- `feat(telegram-publishing): add Bot API sender adapter`

---

## Success Criteria

```bash
# Verificar que el endpoint responde
curl -X POST http://localhost:3030/telegram-publishing/publish \
  -H "Content-Type: application/json" \
  -d '{"chain":"solana","address":"...","score":85,"classification":"STRONG"}'

# Expected en logs: message_id real devuelto por Telegram
```