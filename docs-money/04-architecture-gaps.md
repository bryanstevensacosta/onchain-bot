# 04 · Arquitectura actual vs lo que necesitas para monetizar

> **Propósito**: gap analysis concreto entre tu repo y los modelos de negocio
> descritos en `02-monetization-options.md`. Cada item referencia archivos
> reales del repo y los ToS que motivan el cambio.

---

## 0. Estado actual del repo (resumen verificado)

| Capa | Stack | Estado |
|---|---|---|
| Backend | NestJS, hexagonal, events in-process | ✅ Maduro, 306 tests |
| Persistencia | In-memory + TypeORM opcional (`DATABASE_ENABLED=true`) | 🟡 Tier-1 in-mem, Tier-2 TypeORM |
| Telegram ingestion | MTProto (telegram library) | ✅ Funcional vía user account |
| Telegram publishing | MTProto a canales de output propios | ✅ Funcional con mock + real |
| Frontend | React + Vite + TanStack Query + Socket.IO | ✅ Dashboard bound a 127.0.0.1 |
| Bot API | Token env var existe, **sin handlers** | 🔴 No implementado |
| Telegram Stars | — | 🔴 No implementado |
| Auth/API keys | — | 🔴 No implementado |
| Privacy policy / ToS pages | — | 🔴 No existen |

**Archivos clave que tocará cada gap**:
- `apps/backend/src/shared/common/config/app.config.ts:193` — `botToken` ya en config.
- `apps/backend/src/telegram/shared/infrastructure/senders/mtproto-sender.client.ts:1` — MTProto compartido.
- `apps/backend/src/telegram/ingestion/infrastructure/messaging/` — bus de eventos de ingestion (refactorizado de `kol/ingestion/`).

---

## 1. Componentes compartidos que faltan (bloquean todos los modelos)

### 1.1 Bot oficial Alpha Meta

**Lo que necesitas**:
- Crear `@AlphaMetaBot` vía `@BotFather` (https://t.me/BotFather).
- Guardar el token en `TELEGRAM_BOT_TOKEN` (ya en `app.config.ts:193`).
- Implementar un nuevo BC: `apps/backend/src/bot/` o `apps/backend/src/telegram-bot/`.

**Esqueleto hexagonal**:

```
telegram-bot/
├── api/
│   └── http/bot.controller.ts       # webhook setup
├── application/
│   ├── handlers/
│   │   ├── start-command.handler.ts
│   │   ├── track-channel.handler.ts
│   │   ├── untrack-channel.handler.ts
│   │   ├── paysupport.handler.ts    # ← OBLIGATORIO Bot Dev §6.2.1
│   │   └── privacy-policy.handler.ts
│   └── ports/
│       └── bot-delivery.port.ts
├── domain/
│   ├── entities/user-session.entity.ts
│   └── value-objects/
│       ├── subscription-tier.vo.ts
│       └── tracked-channel.vo.ts
└── infrastructure/
    ├── adapters/
    │   ├── telegraf-bot.adapter.ts        # usa `telegraf` o `grammy`
    │   └── stars-payment.adapter.ts
    └── event-bus/
        └── bot-command.handler.ts
```

**Dependencias a añadir**:
- `telegraf` o `grammy` (recomiendo `grammy` — más liviano, mejor TS).
- `@nestjs/event-emitter` ya está (lo usa tu `in-process-publishing-event.publisher.ts:7`).

**Tests obligatorios antes de lanzar** (no negociables):
- `/paysupport` responde con un ticket o escalación a humano.
- `/privacy` muestra la privacy policy.
- `/start` no envía nada hasta que el user interactúe (no unsolicited).
- Rate-limit por user (no respondas a >5 comandos/segundo/user).

**Referencia ToS**: Bot Developer ToS §2 + §4 + §6.2.1 [https://telegram.org/tos/bot-developers].

---

### 1.2 Integración con Telegram Stars

**Cuándo la necesitas**: para suscripciones B2C in-bot.

**Lo que ya sabes de los ToS**:

> *"all transactions pertaining to digital goods and services must be executed
> exclusively through the exchange of Telegram Stars"*
> — Bot Developer ToS §6.2 [https://telegram.org/tos/bot-developers]

**Lo que necesitas construir**:

```typescript
// apps/backend/src/telegram-bot/infrastructure/adapters/stars-payment.adapter.ts

interface StarsPaymentPort {
  // Cobrar X Stars al user (digital good)
  createInvoice(params: {
    title: string;
    description: string;
    payload: string;        // metadata para reconciliar
    priceInStars: number;
  }): Promise<Invoice>;

  // Verificar que el pago se completó
  verifyPreCheckout(payload: string): Promise<boolean>;

  // Reembolsar (cuando aplica)
  refundStars(userId: number, transactionId: string): Promise<void>;
}

// Eventos a manejar del lado de Telegram:
// - pre_checkout_query  → verificar y responder OK
// - successful_payment   → acreditar tier al user
```

**No reinventes la rueda**: las APIs oficiales de Stars en `telegraf`/`grammy`
manejan `pre_checkout_query` y `successful_payment` automáticamente. Solo
conéctalo a tu capa de aplicación.

**Schema en Postgres** (Tier-2):

```typescript
// entities/payment.entity.ts
{
  id: string;                // transaction_id de Telegram
  userId: number;            // Telegram user id
  starsAmount: number;
  usdEquivalent: number;     // 0.013 USD/Star en el momento del pago
  productCode: string;       // 'premium_monthly', 'pro_annual', etc.
  status: 'pending' | 'completed' | 'refunded' | 'failed';
  createdAt: Date;
  completedAt: Date | null;
}
```

**Referencia ToS**: Bot Dev §6.2 + §6.2.4 [https://telegram.org/tos/bot-developers].

---

### 1.3 Privacy policy + ToS del bot

**Lo que necesitas**:
- Privacy policy en Markdown renderizable.
- Hosteada en un path público (ej. `apps/frontend/public/privacy.md` o subdominio).
- Link en el bot (`/privacy`) y en los store listings si publicas app.

**Contenido mínimo de la privacy policy** (Bot Dev §4 [https://telegram.org/tos/bot-developers]):
- Qué datos recolectas (Telegram user id, interactions).
- Para qué los usas (autenticación, entrega de alerts).
- Cuánto los retienes (concretar: 90 días para históricos, indefinido mientras el user esté activo).
- Cómo el user pide baja + borrado.
- Que Alpha Meta no está afiliado con Telegram.
- Contacto del DPO / responsable.

**Referencia ToS**: Bot Dev §4 [https://telegram.org/tos/bot-developers].

---

### 1.4 Opt-in ToS para KOLs

**Cuándo lo necesitas**: cuando abras el flujo `Track My Channel`.

**Lo que necesita aceptar el KOL**:

```markdown
# Alpha Meta — Track My Channel Agreement

Al solicitar tracking de tu canal @X, confirmas:

1. Eres owner/admin legítimo del canal.
2. Aceptas que Alpha Meta almacene metadatos derivados
   (contract addresses, tickers, scores, métricas) de tus calls.
3. Aceptas que Alpha Meta muestre estadísticas agregadas
   (win-rate, ROI, achievements) asociadas a tu @username.
4. Aceptas recibir el badge "Alpha Meta Verified".
5. Puedes solicitar baja en cualquier momento vía /untrack.
   Tus datos serán borrados en ≤30 días.

Alpha Meta NO publicará tus mensajes literales. Solo republicará
metadatos + un link "Source: @tu_canal" al mensaje original.
```

**Implementación**:
- Botón inline `[Acepto]` que persiste en `kol_consent_log` table.
- Sin aceptación → no se subscribe al canal.
- Log inmutable (audit trail ante reportes).

---

## 2. Gap analysis por línea de monetización

### 2.1 Suscripciones premium vía Stars (B2C)

| Componente | Lo que tienes | Lo que falta |
|---|---|---|
| Detección de calls | ✅ `token/normalization/`, `token/scoring/` | — |
| Scoring del user | 🟡 Parcial (`reputation/`, `stats/`) | Scoring custom por user (qué chains le interesan, qué tickers) |
| Bot de entrega | 🔴 | `telegram-bot/` BC entero |
| Payment Stars | 🔴 | `StarsPaymentPort` adapter |
| Tier gating | 🔴 | `UserSubscription` entity + guard |
| Frontend de billing | 🔴 | Página web de Stars top-up (opcional, pueden pagar desde el bot) |

**Orden sugerido**:
1. Crear el bot (`telegram-bot/`).
2. Implementar Stars para 1 producto simple (ej: "Premium monthly" = 100 Stars).
3. Tier gating en el publisher: añadir un nuevo `OutputChannel` con tier
   `PREMIUM_USER` que enruta a `userId` específico en vez de `channelId`.
4. Iterar pricing.

---

### 2.2 BuyBot para proyectos (B2B)

| Componente | Lo que tienes | Lo que falta |
|---|---|---|
| Detección de calls por proyecto | 🟡 Parcial (filtros por chain+address) | Mapping `proyecto_id → token_addresses[]` |
| Multi-tenant output channels | 🔴 | Hoy `OutputChannelResolverPort` lista hardcoded |
| Rate limit por chat | 🔴 | Bottleneck o `p-queue` por `chatId` |
| Dedupe window | 🟡 VO预留 (`PublishStatus.SKIPPED` en `publish-status.vo.ts:17`) | Lógica de ventana temporal |
| Dashboard B2B | 🟡 Tu `apps/frontend/` ya es React+TanStack | Adaptar a vista "por proyecto" con auth |
| Billing recurrente | 🔴 | Subscription mgmt fuera de Telegram (USDT/Stripe) |

**Cambios concretos al código**:

```typescript
// ANTES (apps/backend/src/telegram/vip-calls-channel/domain/value-objects/output-channel.vo.ts:20)
OutputChannel = { channelId, username, tier: 'PRIMARY' | 'SECONDARY' | 'PREMIUM' }

// DESPUÉS
OutputChannel = {
  channelId,
  username,
  tier: 'PRIMARY' | 'SECONDARY' | 'PREMIUM' | 'B2B_CLIENT',
  clientId?: string,        // ← nuevo: link a proyecto cliente
  tokenFilters?: Address[],  // ← nuevo: solo publicar calls de estos tokens
  dedupeWindowMs?: number,   // ← nuevo: no republish mismo (chain,addr) en X ms
}
```

**Esquema nuevo en Postgres** (ya tienes TypeORM listo):

```typescript
// entities/project-client.entity.ts
{
  id: string;
  name: string;
  telegramChatId: string;     // donde publicar
  tokenAddresses: string[];   // qué tokens le interesan
  chains: ChainId[];
  tier: 'starter' | 'pro' | 'enterprise';
  billing: { model: 'flat_monthly' | 'revshare'; amountUsd: number };
  createdAt: Date;
  expiresAt: Date;
  status: 'active' | 'paused' | 'cancelled';
}
```

---

### 2.3 Ads nativos

| Componente | Lo que tienes | Lo que falta |
|---|---|---|
| Message formatter con footer ad | 🟡 Parcial | Nuevo método `formatWithAd(call, ad?)` |
| Ad rotation engine | 🔴 | `AdCampaign` entity + scheduler |
| Disclosure `[AD]` | 🔴 | Template explícito (Bot Dev §5.3) |
| Self-serve portal | 🔴 | Página web o bot flow |
| KYC manual de advertisers | 🔴 | Proceso manual (no automatizar hasta tener volumen) |

**Esquema**:

```typescript
// entities/ad-campaign.entity.ts
{
  id: string;
  advertiserName: string;
  advertiserContact: string;     // para KYC manual
  brandHandle: string;           // @proyecto
  body: string;                  // mensaje del ad (< 300 chars)
  status: 'pending_kyc' | 'active' | 'paused' | 'rejected';
  budget: number;
  spent: number;
  startsAt: Date;
  endsAt: Date;
  capPerDay: number;             // máx ads/día
  capPerUser: number;            // máx ads/ventana por user
}
```

---

### 2.4 Revenue share trading bots

| Componente | Lo que tienes | Lo que falta |
|---|---|---|
| Evento de call publicado | ✅ `publishing.telegram.published` | — |
| Affiliate link generation | 🔴 | Función pura: `generateDeepLink(chain, addr, affiliateId)` |
| Tracking de conversions | 🔴 | Webhook desde Maestro/Trojan para reconciliation |
| Disclosures | 🔴 | "Includes affiliate links. Not financial advice." |

**Lo más simple**: deep-link estático al trading bot con tu `affiliate_id`:

```typescript
// apps/backend/src/shared/affiliates/
function maestroLink(chain: ChainId, addr: string): string {
  return `https://t.me/MaestroBot?start=alphameta-${chain}-${addr}`;
}
```

Lo agregas como línea en `DefaultMessageFormatterAdapter.format()`.

---

### 2.5 KOL Fast Track

| Componente | Lo que tienes | Lo que falta |
|---|---|---|
| KOL leaderboard | 🟡 `kol/stats/` + `kol/reputation/` | Vista pública (web) |
| KOL opt-in flow | 🔴 | Bot flow `/track_my_channel` |
| Cola + Fast Track | 🔴 | Sistema de tickets |
| Payment | 🔴 | Stars o USDT |

**Reaprovecha mucho**:
- Tu `KolReputation` (`kol/reputation/`) ya tiene los datos para el leaderboard.
- Tu `KolStats` ya calcula win-rate y ROI.

---

### 2.6 API B2B

| Componente | Lo que tienes | Lo que falta |
|---|---|---|
| Datos en Postgres | ✅ TypeORM entities en muchos BCs | — |
| Frontend TanStack Query | ✅ | Misma capa, expuesta como REST/WS |
| Auth | 🔴 | API key issuance + middleware |
| Rate limiting | 🔴 | Por API key + por IP |
| Billing | 🔴 | Stripe / crypto |

**Esqueleto** (puede ser un nuevo BC `api-public/`):

```
apps/backend/src/api-public/
├── api/http/
│   ├── v1/
│   │   ├── calls.controller.ts      # GET /v1/calls?chain=&since=
│   │   ├── kols.controller.ts       # GET /v1/kols/:id/stats
│   │   └── tokens.controller.ts     # GET /v1/tokens/:chain/:addr
│   └── middleware/
│       ├── api-key-auth.guard.ts
│       └── rate-limit.guard.ts
└── domain/services/
    └── query-optimizer.service.ts  # read-only views agregadas
```

---

### 2.7 White-label SaaS

| Componente | Lo que tienes | Lo que falta |
|---|---|---|
| Hexagonal | ✅ | — |
| Multi-tenancy | 🟡 Parcial (cada `OutputChannel` puede tener `clientId`) | Multi-tenancy en TODOS los BCs |
| Tenant onboarding | 🔴 | Self-serve o assisted |

No prioritario hasta tener 10+ clientes. Skip por ahora.

---

### 2.8 Token propio

**No recomendado hasta Fase 4.** Si llegas, todo este BC necesita:
- Conversión a Mini App (webapp embebido).
- Wallet integration TON Connect (Bot Dev §7.2 [https://telegram.org/tos/bot-developers]).
- Compliance con TON-only (Bot Dev §7).
- Abogado cripto externo.

---

## 3. Cambios en infra compartida

### 3.1 Database migrations

Hoy tu `DATABASE_ENABLED=true` ya activa TypeORM. Para los gaps necesitas
migraciones para:
- `payment` (Stars)
- `kol_consent_log`
- `project_client` (B2B)
- `ad_campaign`
- `user_subscription`
- `api_key` (B2B API)

**Convención TypeORM** que veo en tu repo:
- Entidad TypeORM en `infrastructure/persistence/typeorm/entities/<x>.entity.ts`
- Mapper en `infrastructure/persistence/typeorm/mappers/<x>.mapper.ts`
- Repository en `infrastructure/persistence/typeorm/repositories/typeorm-<x>.repository.ts`

Mantén esa convención.

### 3.2 Configuración

Añadir a `app.config.ts`:

```typescript
bot: {
  token: process.env.TELEGRAM_BOT_TOKEN,
  username: process.env.TELEGRAM_BOT_USERNAME,    // @AlphaMetaBot
  webhookUrl: process.env.TELEGRAM_BOT_WEBHOOK_URL,
  adminUserIds: process.env.TELEGRAM_ADMIN_USER_IDS?.split(',').map(Number),
},
billing: {
  starsEnabled: process.env.BILLING_STARS_ENABLED === 'true',
  externalProvider: process.env.BILLING_EXTERNAL_PROVIDER,  // 'stripe' | 'nowpayments'
  externalApiKey: process.env.BILLING_EXTERNAL_API_KEY,
},
ads: {
  enabled: process.env.ADS_ENABLED === 'true',
  capPerDay: Number(process.env.ADS_CAP_PER_DAY ?? 3),
},
kol: {
  optInRequired: process.env.KOL_OPTIN_REQUIRED === 'true',
  dataRetentionDays: Number(process.env.KOL_DATA_RETENTION_DAYS ?? 90),
},
```

### 3.3 Observability

Añadir métricas Prometheus (o lo que uses):
- `bot_commands_total{command, status}`
- `payments_total{product, status, currency}`
- `kol_tracked_total{status}` (active/pending/opted_out)
- `publishes_total{tier, status}` (ya lo cubre tu pipeline)
- `messages_persisted_with_raw_text` (debería ser 0 — alert si sube)

---

## 4. Roadmap técnico sugerido (orden de implementación)

### Fase 0 (semana 1–2): Compliance baseline — **hazlo ANTES de monetizar**

- [ ] Crear privacy policy + ToS del bot (Markdown en `apps/frontend/public/`).
- [ ] Implementar tests anti-scraping (ver `03-dos-and-donts.md §4.2`).
- [ ] Modificar ingestion para NO persistir texto crudo.
- [ ] Configurar backup de la cuenta Telegram (2FA + session string guardada offline).
- [ ] Auditar manualmente el `canonical-call` schema: ¿algún campo contiene texto?

### Fase 1 (semana 3–6): Bot base + KOL opt-in

- [ ] Crear `@AlphaMetaBot` vía @BotFather.
- [ ] Implementar BC `telegram-bot/` con comandos básicos.
- [ ] Implementar `/track_my_channel` con opt-in contractual.
- [ ] Implementar `/privacy`, `/untrack`, `/paysupport` (skeleton).
- [ ] Closed beta con whitelist (50 KOLs y 200 users).

### Fase 2 (semana 7–12): Monetización #1 — KOL Fast Track

- [ ] Implementar Stars para Fast Track (1 producto simple).
- [ ] Crear leaderboard público web (`apps/frontend/src/pages/leaderboard`).
- [ ] Tabla `kol_consent_log`.
- [ ] Self-serve onboarding para KOLs (sin intervención manual).

### Fase 3 (mes 4–6): Monetización #2 — B2B BuyBot

- [ ] Multi-tenant `OutputChannel` (campo `clientId`).
- [ ] Tabla `project_client` + dashboard B2B.
- [ ] Rate limiting por chat (Bottleneck).
- [ ] Contrato de servicio + billing USDT/Stripe.

### Fase 4 (mes 6–9): Monetización #3 — Suscripciones B2C premium

- [ ] Stars para "Pro" y "Premium" tiers.
- [ ] User subscription entity + tier gating en el publisher.
- [ ] Marketing channel público (con disclaimers).

### Fase 5 (mes 9–12): Monetización #4 — Ads + Affiliate

- [ ] Ad campaign entity + formatter con disclosure.
- [ ] Affiliate deep-link generation.
- [ ] Self-serve ad portal.

### Fase 6 (mes 12+): Monetización #5 — API B2B

- [ ] API pública REST con API key auth.
- [ ] Rate limiting.
- [ ] Stripe billing.

### Fase 7 (opcional, mes 18+): Token TON

- [ ] Conversión a Mini App.
- [ ] TON Connect integration.
- [ ] Abogado cripto en el equipo.

---

## 5. Próximo archivo

`README.md` (índice maestro + bibliografía completa de URLs verificadas).
