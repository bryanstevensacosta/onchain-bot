# 02 · Modelos de monetización viables para Alpha Meta

> **Propósito**: mapear cada forma realista de hacer dinero con tu pipeline actual
> al marco legal que vimos en `01-telegram-tos-summary.md`. Cada opción está
> evaluada en: encaje con tu código, encaje con los ToS, esfuerzo y riesgo de ban.

---

## 0. Recordatorio: tu superficie de monetización

Tu pipeline produce **metadatos derivados** (contract addr, ticker, score, métricas,
KOL source). Eso es lo que monetizas, no el texto crudo. Esa distinción es la
que te mantiene en zona legal.

Tus canales de output (`telegram/vip-calls-channel/`) son canales que TÚ controlas →
publicar ahí es tu UGC, sin problema legal.

Tu ingestion (`kol/ingestion/`) NO se usa para mandar mensajes, solo para
leer → uso legítimo de user.

**Tu producto, traducido a una frase**: *"Servicio de alertas cripto generado a
partir de inteligencia sobre KOLs de Telegram, entregado por bot propio."*

---

## 1. Tabla comparativa de modelos

| # | Modelo | Tipo de cliente | Pasarela de pago | Esfuerzo | Riesgo de ban | LTV |
|---|---|---|---|---|---|---|
| 1 | Suscripciones premium vía bot | B2C (traders) | Telegram Stars (obligatorio) | M | 🟢 Bajo | Medio |
| 2 | BuyBot para proyectos | B2B (proyectos cripto) | Externa (USDT/crypto/Stripe) | M-A | 🟢 Bajo | Alto |
| 3 | Ads nativos en tus canales | B2B (proyectos/KOLs) | Externa | M | 🟡 Medio | Alto |
| 4 | Revenue share con trading bots | B2C | Externa (del trading bot) | S | 🟢 Bajo | Medio |
| 5 | KOL freemium + Fast Track | B2KOL | Stars o externa | S | 🟢 Bajo | Medio |
| 6 | API/data service (B2B) | B2B (hedge funds, research desks) | Externa | M | 🟢 Bajo | Alto |
| 7 | SaaS white-label | B2B (otros analytics firms) | Externa | A | 🟢 Bajo | Alto |
| 8 | Token propio en TON | B2C | Solo TON | A | 🔴 Alto | Especulativo |

S = Small, M = Medium, A = Alto esfuerzo.

---

## 2. Cada modelo en detalle

### 2.1 Suscripciones premium vía bot (B2C)

**Qué vendes**: alertas filtradas, señales con más metadata, ranks custom, sin
publicidad en el feed.

**Por qué encaja con los ToS**:

> *"all transactions pertaining to digital goods and services must be executed
> exclusively through the exchange of Telegram Stars"*
> — Bot Developer ToS §6.2 [https://telegram.org/tos/bot-developers]

✅ Estás vendiendo un digital good dentro del bot → **obligatorio usar Stars**.

**Lo que ya tienes a favor**:
- Tu pipeline ya filtra y puntúa (`reputation/`, `stats/`) → el "premium" es
  filtros avanzados sobre tu data actual.
- Tu `telegram/vip-calls-channel/` ya sabe emitir mensajes formateados → un canal premium
  es una variación de tier (PRIMARY/SECONDARY/PREMIUM) que en vez de publicar
  público publica a un chat privado del suscriptor.

**Lo que necesitas construir**:
- Bot oficial de Alpha Meta (vía @BotFather).
- Sistema de Stars: `getStarBalance`, `sendPaidMedia` o equivalente, más el handler
  `/paysupport` obligatorio.
  > *"all TPA must be able to respond to the command `/paysupport` and process user
  > requests regarding payment issues"*
  > — Bot Developer ToS §6.2.1 [https://telegram.org/tos/bot-developers]
- Lógica de gating por user ID (in-memory OK para empezar, Postgres para escala).

**Pricing reference** (no es advice, es lo que el incumbente cobra):
> *"Each message successfully broadcasted over the free threshold of 30 messages
> per second incurs a non-refundable fee of 0.1 Stars"*
> — Bot Developer ToS §6.2.5 [https://telegram.org/tos/bot-developers]

Eso te da un floor: 0.1 Stars ≈ ~$0.002 por mensaje. Para suscripciones reales,
el incumbente del mercado trabaja en rangos de:
- Free tier: gratis
- Pro tier: ~50 USDT/mes equivalente
- Premium tier: ~150-300 USDT/mes equivalente

Cobrar en Stars directamente implica que Apple/Google se quedan con ~30% del
precio de Stars. Para evitar esto, muchos bots en la práctica facturan en USDT
fuera del bot y solo usan Stars para digital goods pequeños. La línea ToS es
clara: si es digital good vendido en el bot → Stars. Si es servicio B2B fuera
del bot → pasarela externa.

**Riesgo de ban**: 🟢 bajo. Cumples literalmente la regla.

---

### 2.2 BuyBot para proyectos (B2B)

**Qué vendes**: cuando un KOL de tu red menciona el token de un proyecto, tu bot
auto-postea en el grupo oficial del proyecto con: "🚨 @kol acaba de llamarte a
$TOKEN @ $XXk mcap".

**Por qué encaja con los ToS**:

> *"Telegram does not process payments for physical goods and services. Instead,
> Bot Platform provides a set of APIs that allow developers to interface solely and
> directly with third-party payment providers for the purposes of receiving payments."*
> — Bot Developer ToS §6.1 [https://telegram.org/tos/bot-developers]

✅ Es un servicio vendido FUERA de Telegram (Stripe, USDT, contrato B2B).
No es un digital good in-bot → no estás obligado a Stars.

**Lo que ya tienes a favor**:
- Tu `PublishedCall` ya tiene audit trail de qué canales se publicaron
  (`telegram/vip-calls-channel/domain/entities/published-call.entity.ts:42`).
- Tu `OutputChannelResolverPort` ya soporta tier + score (`output-channel.vo.ts:56-60`).
- Solo necesitas un nuevo adapter que publique a un `chatId` variable (el del
  grupo del proyecto cliente) en vez de tus canales fijos.

**Pricing reference**: el incumbente del mercado cobra 1–5 ETH/mes por proyecto.
Mercado objetivo: tokens recién lanzados que quieren tracción los primeros 30 días.

**Lo que necesitas construir**:
- Multi-tenant: cada proyecto cliente = un `chatId` + `tier` propios.
- Anti-spam: rate limit por chat, dedupe window por `chain+address`
  (tu `PublishStatus.SKIPPED` ya está预留 para esto, ver
  `publish-status.vo.ts:17`).
- Dashboard B2B (web) para que el cliente vea su usage, ROI, log de alertas.
  Tu `apps/frontend/` ya tiene React + TanStack Query → reaprovechas.

**Riesgo de ban**: 🟢 bajo. Es el modelo con menos fricción legal porque el
dinero no fluye por Telegram.

---

### 2.3 Ads nativos en tus canales (B2B)

**Qué vendes**: espacio publicitario en tus canales de output (banner al final
del mensaje de alerta, mensajes "Sponsored" dedicados).

**Por qué encaja con los ToS**:

> *"you may choose to monetize individual posts, making their contents hidden unless
> readers offer a certain number of Telegram Stars to unlock them"*
> — Content Creator ToS §2.2 [https://telegram.org/tos/content-creator-rewards]

> *"Your TPA must always ensure that interface elements are functional... you are
> prohibited from altering or misrepresenting any component or dialog of your TPA
> interface to falsely appear as notifications or alerts originating from Telegram"*
> — Bot Developer ToS §5.3 [https://telegram.org/tos/bot-developers]

✅ Puedes monetizar tus canales propios (son tu UGC).
⚠️ Cada ad debe estar claramente etiquetada como "Sponsored" o "Ad".

**Lo que ya tienes a favor**:
- Tu `DefaultMessageFormatterAdapter` (`telegram/vip-calls-channel/infrastructure/
formatters/default-message-formatter.adapter.ts`) ya estructura el mensaje →
  añadir un footer "Sponsored by @proyecto" es trivial.
- Tus canales de output ya tienen audiencia acumulada de KOLs y followers.

**Lo que necesitas construir**:
- Sistema de self-serve para que un proyecto reserve un slot (no necesitas ser
  un Telegram Ads Platform oficial — solo tu canal).
- Disclosure claro: `ad | sponsored` en el header del mensaje
  (Bot Dev §5.3 + mejores prácticas FTC).
- Cap de frecuencia: no más de 1 ad cada N alertas para no matar engagement.

**Pricing reference**: el incumbente del mercado publica rates de 1–10k USD/mes
por canal propio con >50k views/día. Tu volumen al inicio será menor.

**Riesgo de ban**: 🟡 medio. Si un ad lleva a scam/honeypot, Telegram puede
señalarte como permisivo con UGC malicioso (Bot Dev §5.1). Mitigación: KYC
manual del advertiser + disclaimer legal.

---

### 2.4 Revenue share con trading bots (B2C affiliate)

**Qué vendes**: integración con bots de trading (Maestro, Trojan, BonkBot, etc.)
para que cuando tu alerta dispare, el user pueda ejecutar la compra en 1-click.
Tú cobras una comisión sobre el volumen tradeado referido.

**Por qué encaja con los ToS**:
- El pago lo procesa el trading bot, no Telegram.
- Tu rol es solo "facilitar el deep-link" al trading bot.
- No vendes financial advice, vendes integración técnica.

**Riesgo regulatorio fuera de Telegram**: 🟡 medio.
- "Affiliate for trading" entra en zona gris en algunas jurisdicciones
  (ESMA, SEC, etc.) que consideran eso como "inducement to trade".
- Mitigación: disclaimer prominente ("Not financial advice. Affiliate link.
  You may lose 100%.")

**Pricing reference**: 10–25% de la comisión del trading bot por usuario referido.
El incumbente del mercado publica casos de 6 cifras/mes.

**Lo que ya tienes a favor**:
- Tus alertas ya tienen `contractAddress`, `chainId`, `ticker` → deep-link
  generation es trivial.
- Tu backend ya emite eventos (`publishing.telegram.published`) → enganchas
  el affiliate link en el handler.

**Riesgo de ban**: 🟢 bajo (es solo un link en el mensaje).

---

### 2.5 KOL Freemium + Fast Track (B2KOL)

**Qué vendes**: a los KOLs, les das visibilidad gratis en tu leaderboard
(verify badge, achievements, notify personal). El "Fast Track" es pago: saltarse
la cola de review.

**Por qué encaja con los ToS**:
- El KOL paga por un **servicio de priorización**, no por datos (los datos son
  derivados de su propio canal).
- Es legal: él te está pagando a ti por incluirlo antes en tu leaderboard.
- Si cobras en Stars: encaja como "digital service" (Bot Dev §6.2).
- Si cobras en USDT: servicio fuera de Telegram (Bot Dev §6.1).

**Lo que ya tienes a favor**:
- Tu `kol/identity/` + `kol/reputation/` + `kol/stats/` ya calcula todo lo
  necesario para el leaderboard.

**Lo que necesitas construir**:
- Bot flow: `/start` → "Track My Channel" → "Join Queue" o "Fast Track".
- Sistema de pagos (Stars o crypto).
- Página pública con stats del KOL (puede ser tu frontend actual adaptado).

**Pricing reference**: tier "Fast Track" 0.5–1 ETH único, o mensual recurrente
de 0.1–0.3 ETH.

**Riesgo de ban**: 🟢 bajo. No es scraping, es servicio al KOL.

---

### 2.6 API / data service (B2B institucional)

**Qué vendes**: acceso vía API REST/WebSocket a tus datos agregados (calls
detectados, scores de KOLs, achievements, trending tokens). Sin bot, sin UI.

**Por qué encaja con los ToS**:
- La entrega es FUERA de Telegram (HTTPS).
- Estás vendiendo **datos derivados agregados**, no UGC scrapeado.
- Compradores típicos: hedge funds, family offices, research desks, otros
  analytics firms.

**Lo que ya tienes a favor**:
- Tu backend ya tiene Postgres con `canonical-call` y `channel-reputation-stats`.
- Tu `apps/frontend/` ya usa TanStack Query → patrón a copiar para una API
  pública.

**Lo que necesitas construir**:
- API key auth + rate limiting (tú eres el rate-limiter ahora).
- ToS del cliente que diga "datos son derivados, no constituyen investment advice".
- Dashboard B2B mínimo.

**Pricing reference**: tier Starter $500/mes (10k calls), Pro $2k/mes (100k
calls), Enterprise $5k+/mes (volume + dedicated support).

**Riesgo de ban**: 🟢 bajo. Tu producto es la API, no un bot.

---

### 2.7 SaaS white-label

**Qué vendes**: tu pipeline entero (discovery + ingestion + scoring + publishing)
como servicio licenciado a otras firmas de analytics.

**Por qué encaja con los ToS**:
- Idéntico a §2.6 pero más profundo: el cliente corre TU software.
- ToS del cliente debe incluir que él es responsable del cumplimiento ToS
  cuando use MTProto/ingest.

**Lo que ya tienes a favor**:
- Tu arquitectura hexagonal (`apps/backend/src/*/`) está diseñada para esto.
- Postgres + TypeORM ya soporta multi-tenant via `schema/collection`.

**Riesgo de ban**: 🟢 bajo, pero si tu cliente viola ToS, tu marca sufre
(opta por un ToS cliente que limite responsabilidad).

---

### 2.8 Token propio en TON (alto riesgo, alto upside)

**Qué vendes**: lanzas el token $ALPHA en TON. Holders tienen acceso premium
gratis. Captas upside especulativo + treasury.

**Por qué encaja con los ToS (con asterisco)**:
> *"All Mini Apps which implement cryptocurrency functionality, either within the
> Mini App itself or within its connected bot, are required to be based exclusively
> on The Open Network (TON) blockchain."*
> — Bot Developer ToS §7 [https://telegram.org/tos/bot-developers]

✅ Si haces Mini App, TON es la única blockchain permitida.
❌ Si haces bot puro sin Mini App, esta regla NO te aplica (Blockchain Guidelines
https://core.telegram.org/bots/blockchain-guidelines).

**Lo que NO encaja**:
- ❌ Lanzar token en Ethereum/Solana/BSC y meterlo en tu bot → prohibido
  (Bot Dev §7.4).
- ❌ Hacer pre-sale tipo ICO → en muchas jurisdicciones es un security offering
  (regulatoriamente requiere registration/licencia).
- ❌ Prometer yield/ROI al holder → "MLM or ponzi schemes" prohibido (Bot Dev
  §5.2(d-i)).

**Riesgo de ban**: 🔴 alto. Si Telegram decide que tu token es "misleading users"
o tu Mini App es "social growth manipulation", te cierran.
**Riesgo regulatorio**: 🔴🔴🔴 alto. Tokens son securities en USA, EU, UK en
muchos casos. Habla con abogado cripto antes.

**Recomendación**: no lo hagas como primera línea de monetización. Si llegas
a tener un producto sólido con revenue, evalúa con abogado.

---

## 3. Combinación recomendada (no elijas solo una)

La salud financiera viene de **combinar 3–4 líneas**:

```
Fase 1 (mes 0–6, sin revenue significativo):
  - Closed beta gratis (validas PMF)
  - Leads para fase 2

Fase 2 (mes 6–12, primeros $):
  - 2.5 KOL Fast Track (ingresos pequeños pero branding)
  - 2.2 BuyBot para 3–5 proyectos piloto ($$ recurrentes)

Fase 3 (mes 12–24, escala):
  - 2.1 Suscripciones premium vía Stars (B2C core)
  - 2.3 Ads nativos (margen alto, escala con audiencia)
  - 2.4 Revenue share trading bots (compounding)
  - 2.6 API B2B (enterprise, contratos largos)

Fase 4 (mes 24+, opcional):
  - 2.7 White-label SaaS
  - 2.8 Token TON (solo con abogado cripto en el equipo)
```

---

## 4. Lo que NO puedes monetizar (lista roja)

| Patrón | Por qué prohibido | Referencia |
|---|---|---|
| Vender los mensajes crudos scrapeados | Scraping + sublicensing prohibido | Bot Dev §4.3 + Content Licensing |
| "Copy trading" automático sin disclaimers | Inducement to trade / financial advice sin licencia | Reglas locales + mejores prácticas |
| Esquemas de referido multinivel | "MLM or ponzi schemes" explícitamente prohibido | Bot Dev §5.2(d-i) [https://telegram.org/tos/bot-developers] |
| Yield farming / staking pools dentro del bot | "social growth manipulation" si hay referral loops | Bot Dev §5.2(d-ii) [https://telegram.org/tos/bot-developers] |
| Pump & dump signals coordinados | Posible securities fraud + ToS violation | Reglas locales + Bot Dev §5.2 |
| Vender tokens en Ethereum/Solana desde Mini App | Solo TON permitido en Mini Apps | Bot Dev §7 [https://telegram.org/tos/bot-developers] |
| Engagement pods / fake followers | "social growth manipulation" | Bot Dev §5.2(d-ii) [https://telegram.org/tos/bot-developers] |
| Pedir passwords / OTPs a users | Phishing explícitamente prohibido | Bot Dev §5.2(d-iv) [https://telegram.org/tos/bot-developers] |

---

## 5. Pricing como variable estratégica (no copies números)

Los precios listados arriba son **referencias del incumbente del mercado** para
que calibres, no recomendaciones. Tu pricing debe depender de:

1. **Valor entregado medible**: ¿cuánto dinero ahorra/gana el usuario con tu
   señal? Si el incumbent cobra $200/mes y el user hace $5k/mes de profit,
   es un ROAS de 25x → puedes cobrar $300 sin fricción.
2. **Elasticidad del segmento**: traders profesionales pagan más que casuals.
3. **Posicionamiento**: ¿eres "el SpyDefi killer" o "el buffet gratis con tier
   premium"? El primero soporta más margen.
4. **Costo de adquisición (CAC)**: si te cuesta $50 adquirir un suscriptor via
   ads, tu LTV tiene que ser >$50 para ser rentable.

---

## 6. Próximo archivo

`03-dos-and-donts.md` — checklist operacional: qué SÍ hacer, qué NO hacer, y
cómo instrumentar tu código para auto-detectar zonas grises.
