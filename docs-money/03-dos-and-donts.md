# 03 · Dos, don'ts y cómo no terminar baneado

> **Propósito**: convertir el análisis legal en un checklist operacional aplicable
> a tu código. Cada item referencia el ToS que aplica y el archivo de tu repo
> donde se instrumenta.

---

## 0. Resumen ejecutivo en una línea

> **Solo persiste metadatos derivados. Solo publica en tus canales. Solo cobra
> Stars para digital goods in-bot. Pagos B2B siempre fuera de Telegram. Pide
> opt-in escrito a cada KOL. Diversifica revenue para sobrevivir un ban.**

---

## 1. ✅ DOs — lo que SÍ hacer

### 1.1 Naming

| Regla | Por qué | Dónde afecta |
|---|---|---|
| Tu producto se llama **"Alpha Meta"** o **"Alpha Meta Token Scanner"**. Nunca "Telegram" en el nombre. | *"the title of your app must not include the word 'Telegram'"* — API ToS §2.3 [https://core.telegram.org/api/terms] | Branding, app store, channel description |
| **Nunca uses el logo de Telegram** (avión de papel). | *"You must not use the official Telegram logo for your app"* — API ToS §2.4 [https://core.telegram.org/api/terms] | UI, ads, materiales |
| En disclaimers di: *"Alpha Meta is not affiliated with Telegram."* | Evita confusión de asociación — Bot Dev §8.1 [https://telegram.org/tos/bot-developers] | `/about`, footer, ToS del bot |

### 1.2 Persistencia

| Regla | Por qué | Dónde |
|---|---|---|
| **Solo persistir metadatos derivados** (`chainId`, `address`, `ticker`, `score`, `kolId`, `timestamp`, métricas). | *"scraping public group or channel contents"* prohibido — Bot Dev §4.3 [https://telegram.org/tos/bot-developers] | `telegram/ingestion/` |
| Si necesitas el texto temporalmente para extraer entities, **bórralo después de parsear**. | *"only ... strictly required to operate the relevant service"* — Content Licensing [https://telegram.org/tos/content-licensing] | Pipeline de extraction |
| Borra datos de un KOL en **≤30 días** si lo pide. | *"Delete user data upon their request"* — Bot Dev §4.2 [https://telegram.org/tos/bot-developers] | Cualquier repo con datos de KOL |
| Implementa **TTL automático** en `canonical-call` (ej: 90 días hot, después aggregated-only). | Reduce superficie de riesgo GDPR. | Postgres |

### 1.3 Publishing

| Regla | Por qué | Dónde |
|---|---|---|
| Solo publica en **tus canales de output** (los que TÚ controlas). | Tus canales = tu UGC, sin restricción. | `telegram/vip-calls-channel/` |
| Cada mensaje de tu canal debe **linkear al mensaje original del KOL** ("Source: @kol — ver mensaje original"). | Refuerza que NO estás reproduciendo UGC, estás referenciando. | `DefaultMessageFormatterAdapter` |
| Marca ads explícitamente: `Sponsored by @proyecto` o `Ad`. | Bot Dev §5.3 — *"you are prohibited from altering or misrepresenting any component... to falsely appear as notifications"* [https://telegram.org/tos/bot-developers] | MessageFormatter |
| **Nunca publiques mensajes de canales con paywall / Stars-locked** sin pasar por Stars. | Estarías evadiendo el paywall del creator. | Filtro en pipeline |

### 1.4 Bot (cuando lo crees)

| Regla | Por qué | Dónde |
|---|---|---|
| Implementa `/paysupport` antes de lanzar cualquier cosa que cobre Stars. | *"all TPA must be able to respond to the command `/paysupport`"* — Bot Dev §6.2.1 [https://telegram.org/tos/bot-developers] | Bot handlers |
| Privacy policy pública, link accesible desde el bot. | Bot Dev §4 [https://telegram.org/tos/bot-developers] | Bot settings + README |
| Activa **2FA en el @BotFather account**. Si pierdes acceso, pierdes el bot + Stars balance. | Bot Dev §6.3 — *"if you delete, compromise or otherwise lose access... all TPA it created may be terminated"* [https://telegram.org/tos/bot-developers] | Account security |
| Si ofreces digital goods in-bot → **solo Stars**. | Bot Dev §6.2 [https://telegram.org/tos/bot-developers] | Payment layer |
| Si ofreces servicios B2B → **pasarela externa** (USDT/crypto/Stripe). | Bot Dev §6.1 [https://telegram.org/tos/bot-developers] | B2B contracts |

### 1.5 KOLs

| Regla | Por qué | Dónde |
|---|---|---|
| **Pide opt-in escrito** vía el bot cuando un KOL solicita ser trackeado. | Convierte "scraping" en "licensing agreement". | `/track_my_channel` flow |
| En el opt-in incluye: qué almacenas, qué publicas, cómo solicitar baja. | Demuestra buena fe ante un reporte. | ToS del bot |
| Ofrece **opt-out con borrado en ≤30 días**. | Bot Dev §4.2 + GDPR. | `/untrack` command |

---

## 2. ❌ DON'Ts — lo que NO hacer

### 2.1 Lo que te banea el bot inmediatamente

| Patrón | Consecuencia | Referencia |
|---|---|---|
| **Spam**: enviar mensajes no solicitados a users que no interactuaron. | Ban inmediato del bot. | Bot Dev §5.2(b) [https://telegram.org/tos/bot-developers] |
| **Pedir password u OTP** del user. | Ban. | Bot Dev §5.2(d-iv) [https://telegram.org/tos/bot-developers] |
| **MLM, Ponzi, referral pyramids** donde el user gana por traer más users con pago. | Ban. | Bot Dev §5.2(d-i) [https://telegram.org/tos/bot-developers] |
| **Impersonar a Telegram** o insinuar afiliación oficial. | Ban + report a app stores. | Bot Dev §8.1 + API ToS §2.3-4 [https://core.telegram.org/api/terms] |
| **Operar con credenciales de Bot API de otros users** para evadir un ban previo. | Ban doble. | Bot Dev §5.2(f) [https://telegram.org/tos/bot-developers] |

### 2.2 Lo que te pone en zona de ban gradual

| Patrón | Por qué | Mitigación |
|---|---|---|
| Almacenar el texto literal del mensaje más allá de lo necesario para extraer. | Bot Dev §4.3 — scraping. | Borrar el texto después de extraer entities. |
| Entrenar cualquier modelo AI/ML con datos de Telegram. | Content Licensing — explícito. | No entrenar con data de Telegram. Period. |
| Subir miles de canales en una sola cuenta MTProto. | Api ToS §1.4 — interferir con basic functionality. | Distribuir entre varias cuentas personales, no userbots. |
| Publicar el mismo contrato a >50 chats/segundo. | Rate limits (Bot Dev §6.2.5). | Bottleneck / rate limiter. |
| Mandar mensajes desde una user account MTProto simulando ser humano. | Api ToS §1.4 — *"making actions on behalf of the user without the user's knowledge"*. | Solo el bot (no la user account) envía. |
| Vender "data cruda scrapeada" como producto. | Sublicensing prohibido — Content Licensing [https://telegram.org/tos/content-licensing]. | Solo vender datos derivados/agregados. |
| Promover wallet/token non-TON dentro de una Mini App. | Bot Dev §7.4 — TON-only. | Si haces Mini App, todo crypto va en TON. Si haces bot puro, no aplica. |

### 2.3 Lo que te banea la app store (si publicas iOS/Android)

| Patrón | Por qué |
|---|---|
| Cobrar digital goods dentro de la app sin IAP de Apple/Google. | Apple §3.1.1 + Google Play billing policy. Telegram Stars cumple esto. |
| Mostrar contenido NSFW o violento sin filtro. | App store guidelines. |
| Compartir datos de user con terceros sin consentimiento. | GDPR + app store privacy rules. |

---

## 3. Patrones de código que te mantienen a salvo

### 3.1 Ingestion (telegram/ingestion/)

```typescript
// ✅ CORRECTO: extraer entities, descartar texto raw
async onNewMessage(raw: RawTelegramMessage) {
  const entities = await this.extractor.extract(raw.text);
  // raw.text se descarta aquí, NO se persiste
  await this.canonicalCallRepo.save({
    chainId: entities.chainId,
    address: entities.contractAddress,
    ticker: entities.ticker,
    kolId: raw.senderId,
    kolUsername: raw.senderUsername,
    sourceMessageId: raw.id,        // link al original
    sourceChannelId: raw.channelId,
    timestamp: raw.date,
    score: await this.scorer.score(entities),
    metrics: await this.validator.validate(entities),
  });
}

// ❌ INCORRECTO: persistir el mensaje crudo
async onNewMessage(raw: RawTelegramMessage) {
  await this.messageRepo.save(raw);  // ← viola Bot Dev §4.3
}
```

### 3.2 Publishing (telegram/vip-calls-channel/)

```typescript
// ✅ CORRECTO: referenciar source, nunca reproducir UGC
format(call: ApprovedCallInput): string {
  return `
🚨 New alpha call detected

Token: $${call.ticker} (${call.name})
Chain: ${call.chain}
Contract: \`${call.address}\`
Marketcap: $${call.marketCapUsd}
Liquidity: $${call.liquidityUsd}
Holders: ${call.holders}
Score: ${call.score}/100

Source: @${call.kolUsername} — https://t.me/${call.kolChannel}/${call.sourceMessageId}

⚠️ Not financial advice. DYOR.
  `.trim();
}

// ❌ INCORRECTO: copiar el texto del KOL
format(call: ApprovedCallInput): string {
  return call.rawKolMessage;  // ← viola Bot Dev §4.3 + copyright del KOL
}
```

### 3.3 Bot handlers (cuando lo crees)

```typescript
// ✅ CORRECTO: opt-in contractual antes de trackear
bot.on('track_my_channel', async (ctx) => {
  await ctx.reply(
    'Para trackear tu canal necesitamos que aceptes:\n\n' +
    '1. Almacenamos: contract addresses, tickers, scores de tus calls\n' +
    '2. Publicamos: stats agregadas + achievements en leaderboard público\n' +
    '3. Mostramos tu @username como Source en republicaciones\n' +
    '4. Puedes solicitar baja con /untrack (borrado en ≤30 días)\n\n' +
    '[Acepto y solicito tracking] [No acepto]'
  );
});

// ❌ INCORRECTO: empezar a trackear sin consentimiento
bot.on('track_my_channel', async (ctx) => {
  await this.ingestion.subscribe(ctx.channelId);  // ← asume consentimiento
});
```

### 3.4 Ad disclosure

```typescript
// ✅ CORRECTO: ad claramente etiquetada
formatAd(sponsored: SponsoredContent): string {
  return `
📢 [AD] Sponsored by @${sponsored.brand}

${sponsored.message}

---
This is a paid advertisement. Alpha Meta does not endorse
the content. Not financial advice.
  `.trim();
}

// ❌ INCORRECTO: ad disfrazada de alerta
formatAd(sponsored: SponsoredContent): string {
  return sponsored.message;  // ← viola Bot Dev §5.3
}
```

---

## 4. Cómo instrumentar auto-detección de zonas grises

Añade al backend checks que te alerten si te acercas a una zona de ban:

### 4.1 Métricas a trackear (en `apps/backend/src/shared/observability/`)

| Métrica | Threshold de alerta | Razón |
|---|---|---|
| Channels tracked per MTProto account | >50 | Api ToS §1.4 |
| Messages ingested per hour per account | >1000 | Anómalo para un user normal |
| Text length persisted in DB | 0 bytes (solo metadatos) | Bot Dev §4.3 |
| Bot Dev §5.1 — UGC rate | monitor % de mensajes con UGC | Responsabilidad legal |
| Rate of opt-outs from KOLs | >5% mensual | Indica fricción en tu opt-in |
| Reports received from Telegram | ≥1 | Inicio de breach |

### 4.2 Tests de compliance (extiende tu suite)

```typescript
// tests/compliance/scraping.test.ts
describe('Anti-scraping compliance', () => {
  it('does not persist raw message text', async () => {
    await ingestion.onNewMessage(sampleMessage);
    const stored = await canonicalCallRepo.findRecent(1);
    expect(stored[0]).not.toHaveProperty('rawText');
    expect(stored[0]).not.toHaveProperty('text');
  });

  it('does not include KOL username in published message body', async () => {
    const formatted = formatter.format(sampleCall);
    // Solo como Source link, no como recomendación
    expect(formatted).toMatch(/Source: @kol/);
    expect(formatted).not.toMatch(/BUY NOW|kol says/);
  });
});
```

---

## 5. Plan de respuesta si Telegram te notifica un breach

```
Día 0: Telegram notifica el breach al account que creó el bot.
         │
         ├─► Lee el mensaje CON DETENIMIENTO. Identifica qué regla alegan.
         │
         ├─► Día 0–2: triage interno.
         │     - ¿Es real el breach o es un falso positivo?
         │     - ¿A qué código/servicio afecta?
         │     - ¿Cuántos users activos dependen?
         │
         ├─► Día 2–7: fix + deploy.
         │     - Corrige el código.
         │     - Borra datos afectados si aplica.
         │     - Responde a Telegram con evidencia del fix.
         │
         ├─► Día 7–10: re-apelación si fue falso positivo.
         │     - Capturas, logs, código del fix.
         │
         └─► Día 10+: si Telegram no levanta el ban:
               - Activa plan B (revenue fuera de Telegram).
               - Notifica a users.
               - Migra a bot nuevo con identidad limpia.
```

**Nunca ignores una notificación de Telegram**. Tienen 10 días de reloj. Si
pierdes ese window:
> *"we will have to discontinue your access to Telegram API and contact the app
> stores about the removal of your apps"*
> — API ToS §4 [https://core.telegram.org/api/terms]

---

## 6. Auto-auditoría mensual (corre este checklist cada mes)

- [ ] Ningún mensaje en mi DB contiene el texto crudo del KOL (`SELECT * FROM calls WHERE raw_text IS NOT NULL`).
- [ ] Todos los mensajes publicados incluyen link al source.
- [ ] Ningún ad está sin etiqueta `[AD]` o `Sponsored`.
- [ ] Privacy policy del bot sigue accesible.
- [ ] `/paysupport` funciona y devuelve respuesta útil.
- [ ] No he agregado nuevos chains/tokens non-TON a ninguna Mini App.
- [ ] Ningún KOL me ha pedido baja sin haber sido procesado en ≤30 días.
- [ ] No he enviado mensajes desde la user account MTProto (solo desde el bot).
- [ ] Revenue de Stars: lo que vendo está clasificado como "digital good" legal.
- [ ] Revenue fuera de Telegram: tengo al menos 1 línea de revenue diversificada.

---

## 7. Próximo archivo

`04-architecture-gaps.md` — qué tiene tu código actual y qué le falta para
instrumentar todo esto (bot, opt-in, payments, ads, multi-tenant B2B).
