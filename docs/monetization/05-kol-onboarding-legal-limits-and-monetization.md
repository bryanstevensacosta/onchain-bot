# 05 · KOLs: legal, límites operativos y modelos de cobro

> **Propósito**: responder las preguntas concretas que surgen al operacionalizar
> el pipeline de KOLs: ¿puedo leerlos sin permiso? ¿cómo los autorizo? ¿me
> pueden demandar por el sistema de reputación? ¿cuántos puedo trackear? ¿les
> cobro? ¿les cobro recurrente?
>
> Este archivo cubre tres ejes: legal, operacional y de negocio.

---

## 0. Resumen ejecutivo (respuestas en una línea)

| Pregunta | Respuesta corta |
|---|---|
| ¿Es prudente verlo como problema leer CAs de KOLs sin opt-in? | **No es problema si solo lees.** Se vuelve problema cuando publicas un leaderboard comercial, rankeas, o cobras por acceso a sus stats. |
| ¿Cómo sería la autorización? | **3 niveles**: (1) ToS del bot al enlistarse, (2) opt-in explícito por mensaje, (3) fee + verificación. |
| ¿Puedo o no puedo? | **Puedes**, pero con opt-in reduces riesgo legal 10x y abres modelos de cobro. |
| ¿Me pueden demandar por el sistema de reputación? | **Sí**, si (a) tu scoring es engañoso, (b) un KOL pierde deals por tu rating, (c) usas su imagen sin permiso. Defensas: disclaimer, metodología pública, dispute process. |
| ¿Máximo de KOLs por cuenta MTProto? | **~200–500 activos** antes de empezar a ver problemas; **~50–100 backfilling**. |
| ¿Cada cuánto puedo ingestar? | **Live**: ~10–20 msg/s por cuenta. **Backfill**: máximo 100 msgs/vez con 60s entre batches. |
| ¿Necesito varios números para 2000 KOLs? | **Sí, 4–8 cuentas** mínimo. Cada una con su `api_id`/`api_hash`/`session`. |
| ¿Cobrar a KOLs nuevos? | **Sí**, "Fast Track" pagado + cola gratis. Estándar del mercado. |
| ¿Cobrarles recurrente para que permanezcan? | **Sí, pero con valor agregado claro** (badge, advanced stats, priority). No como "renta por aparecer". |

---

## 1. Legal: leer CAs y datos de KOLs sin opt-in

### 1.1 Lo que SÍ puedes hacer sin opt-in

Un canal público de Telegram es, por definición, **información pública accesible
a cualquier usuario registrado en Telegram**. Unirse a un canal público y leer
sus mensajes es un acto ordinario de cualquier usuario. Esto lo cubren los ToS
de Telegram:

> *"ordinary, legitimate, and intended use of the Telegram platform as its user"*
> — Content Licensing ToS [https://telegram.org/tos/content-licensing]

Adicionalmente:

- **Las direcciones de contratos son datos on-chain públicos**: cualquier persona
  puede consultar el blockchain y obtenerlas sin permiso de nadie. No están
  sujetas a copyright (son hechos, no expresión).
- **El ticker, market cap, liquidez, holders**: datos públicos derivados de
  blockchain explorers.
- **El análisis (sentiment, score, signal strength)**: derivado tuyo, no UGC.

**Conclusión**: leer, parsear, almacenar y analizar mensajes de canales
públicos **sin opt-in** es defendible legalmente en la mayoría de jurisdicciones.
Es lo que hacen Messari, Nansen, Dune, Kaito, etc.

### 1.2 Lo que NO deberías hacer sin opt-in

Cuando **publicas, rankeas, comparas, o cobras** por datos derivados de un KOL
específico, aparecen riesgos adicionales:

| Acción sin opt-in | Riesgo legal | Por qué |
|---|---|---|
| Publicar "Top 100 KOLs by win rate" con sus @handles | 🟡 Medio | Usas su identidad comercial (right of publicity en algunos estados US como California) + asociación implícita |
| Cobrar por acceso a stats de KOLs específicos | 🔴 Alto | Sublicensing sin licencia contractual; "toma datos de su trabajo sin pagarles" |
| Usar su foto/avatar en tu UI | 🔴 Alto | Publicity rights, trademark侵权 |
| Decir "recomendamos seguir a @X" | 🔴 Alto | False endorsement si @X no te respalda |
| Mostrar un KOL en una lista de "scam alerts" sin verificación | 🔴 Alto | Defamation, tortious interference |

**La línea clara**: extraer datos = legal. Publicar identidad comercial de
terceros con rankings comparativos sin consentimiento = terreno legal resbaladizo.

### 1.3 Marco legal aplicable (resumen por jurisdicción)

| Jurisdicción | Ley relevante | Riesgo |
|---|---|---|
| **EEUU (federal)** | Copyright Act, Lanham Act | Bajo si no reproduces UGC; medio si comparas marcas |
| **EEUU (California)** | Right of Publicity (Cal. Civ. Code §3344) | Medio-alto si usas nombre/avatar con fines comerciales |
| **UE** | GDPR Art. 6/17, right to object | Medio; un KOL puede pedir borrado de sus datos derivados |
| **UK** | UK GDPR + tort of misuse of private information | Bajo-medio; canales son públicos |
| **Singapur** | PDPA | Medio si operas desde allí |
| **LATAM (general)** | Leyes locales de protección de datos + derecho de imagen | Varía; Brasil (LGPD) es estricto |

> **No soy tu abogado.** Esta tabla es orientativa. Para markets específicos
> (US securities para token trading signals, EU MiCA para tu token propio,
> etc.) consulta abogado cripto/TMT.

---

## 2. Cómo autorizar a un KOL (3 niveles)

### Nivel 1: ToS del bot al enlistarse (mínimo viable)

```
[KOL entra a @alphameta_bot]
  └─► /start
        └─► "Track My Channel"
              └─► Muestra ToS:
                  "Al solicitar tracking confirmas que:
                   1. Almacenamos: contract addrs, tickers, scores de tus calls
                   2. Publicamos: stats agregadas + achievements
                   3. Tu @username aparece como 'Source' en republicaciones
                   4. Puedes pedir baja vía /untrack (borrado ≤30 días)
                   
                   [Acepto y solicito tracking]  [No acepto]"
```

- **Costo**: bajo, ~2h de implementación
- **Cobertura legal**: media — el KOL aceptó contractualmente
- **Limitación**: si el KOL nunca entra al bot, no hay opt-in

**Implementación**: ver `04-architecture-gaps.md §1.4` y `fix-1/problem.md §3`
(la columna `kol_consent_log` que ya planeamos).

### Nivel 2: Opt-in explícito por mensaje + persistencia de evidencia

Para KOLs que no quieren entrar al bot:

```
[Alpha Meta envía DM al KOL una vez, con rate-limit]
  "Hola @kol, detectamos que publicas alpha calls de tokens.
   Alpha Meta es un servicio de analytics que mide el rendimiento
   de KOLs. ¿Te gustaría aparecer en nuestro leaderboard público?
   
   Beneficios: badge 'Verified', achievements, exposure gratuito.
   
   [Sí, aparecer]  [No, gracias]  [Preguntar después]"
```

- **Costo**: medio (requiere un outreach flow)
- **Cobertura legal**: alta — evidencia de consentimiento explícito
- **Limitación**: muchos KOLs no responden; ratio de respuesta típico 10–30%

### Nivel 3: Verificación + fee (máxima protección + revenue)

```
[KOL entra a @alphameta_bot → "Track My Channel"]
  └─► Opción A: "Join the Queue" (gratis, 7–30 días de espera)
  └─► Opción B: "Fast Track" (0.5 ETH o 100 Stars, listo en 24h)
        └─► Verificación manual: ownership del canal (KOL debe
            postear un mensaje específico en su canal que tu bot
            detecta como prueba de control)
        └─► Onboarding completado → "Verified" badge
```

- **Costo**: alto (verificación manual o automatizada)
- **Cobertura legal**: máxima — fee + verificación + ToS firmado
- **Limitación**: friction reduce volumen de onboardings

### Recomendación práctica

Implementa los **3 niveles en paralelo**:
- Nivel 1 para cualquier KOL que entre al bot (catch-all)
- Nivel 2 para KOLs descubiertos automáticamente por tu ingestion
- Nivel 3 para KOLs que quieren "Verified" badge y más exposure

Esto maximiza la cobertura legal Y te da un funnel de upgrade a Fast Track.

---

## 3. Riesgos legales del sistema de reputación

Tu `kol/reputation/` y `kol/stats/` calculan win-rate, ROI,
consistency, etc. Esto crea **3 riesgos legales específicos**:

### 3.1 Defamation (difamación)

Si publicas que un KOL tiene X% win rate y es inexacto:
- **Demanda por libel/slander** si el dato es falso y causa daño
- **Defensas**: truth (el dato ES correcto), opinión (es un cálculo matemático),
  disclaimer prominente ("past performance is not indicative of future results")

### 3.2 Tortious interference (interferencia ilícita)

Si un proyecto deja de contratar a un KOL porque tu rating es bajo:
- **Demanda por tortious interference with business expectancy**
- **Defensas**: la información es pública, no hay obligación contractual,
  opinión protegida, no hay "false statement" intencional

### 3.3 Right of publicity (derecho de imagen)

Si usas el @handle, foto o branding del KOL en tu UI comercial:
- **Acción por uso comercial de identidad sin consentimiento**
- **California §3344** y similares en otros estados US
- **Defensas**: newsworthiness (no aplica a producto comercial),
  transformative use (débil para un rating), nominative fair use (débil
  si hay alternativa)

### 3.4 Cómo mitigar todos los anteriores

1. **Disclaimer prominente** en cada página de KOL:
   > *"This rating is an automated calculation based on historical on-chain
   > data. It is not investment advice, an endorsement, or a guarantee of
   > future performance. Methodology: [link]. Disputes: [email]"*

2. **Methodology disclosure** pública — explica CÓMO calculas win rate.
   Si la metodología es opaca → riesgo legal sube.

3. **Dispute process** — el KOL puede pedir revisión si cree que el cálculo
   es incorrecto. Comprométete a un SLA de respuesta (ej: 7 días).

4. **Opt-out con borrado en ≤30 días** — si el KOL no quiere aparecer, lo
   borras. GDPR-friendly, ToS-friendly, signal de buena fe ante juez.

5. **Accuracy audit trimestral** — mide vs ground truth on-chain y publica
   el margen de error. Si tu score tiene +5%偏差 vs realidad, ajustalo.

6. **NO uses "Verified" como endorsement**: el badge significa "this is the
   real channel owned by this person", no "we vouch for their calls".

---

## 4. Límites operativos (cuántos KOLs, cada cuánto)

### 4.1 Límites de Telegram por cuenta

| Aspecto | Límite | Fuente |
|---|---|---|
| Canales/grupos a los que puedes estar unido | ~500 (soft); Telegram no publica un número duro | Límite técnico del cliente |
| FloodWait threshold (lectura) | ~30 requests/s antes de FloodWait | https://core.telegram.org/api/errors#420-flood-wait-2 |
| Broadcast (envío desde user) | ~30 msg/s global, 1 msg/s por chat | https://core.telegram.org/mtproto/auth-key |
| Backfill via `getMessages` | Sin límite duro pero cada llamada dispara eventos | Documentación gramJS |
| Account bans | Sin previo aviso si abusan | ToS API [https://core.telegram.org/api/terms] |

### 4.2 Límites prácticos por cuenta MTProto

| Métrica | Conservador | Agresivo |
|---|---|---|
| Canales trackeados (live ingestion) | 200 | 500 |
| Backfill simultáneo | 50 KOLs | 100 KOLs |
| Mensajes live ingestados/seg | 10 | 20 |
| Mensajes backfilled/seg | 5 | 10 |
| Backfill batch size | 100 msgs | 500 msgs |
| Delay entre backfills | 60s | 30s |
| Cuentas MTProto necesarias para 2000 KOLs | 8–10 | 4 |

### 4.3 Por qué necesitas varias cuentas

Para 2000 KOLs activos simultáneamente:

```
2000 KOLs ÷ 500 max/cuenta = 4 cuentas mínimo
2000 KOLs ÷ 200 conservador = 10 cuentas recomendado
```

Cada cuenta:
- Necesita un **número de teléfono distinto** (virtual number OK: ~$1–5/mes via
  SMS-Activate, TextNow, etc.).
- Tiene su propio `api_id`, `api_hash`, `session string`.
- Si una es baneada, las demás siguen funcionando.

**Importante**: Telegram **prohíbe usar cuentas múltiples para evadir bans**:

> *"your TPA must not operate by proxy (i.e., using Bot API credentials
> supplied by other users) in an attempt to circumvent bans or content moderation."*
> — Bot Developer ToS §5.2(f) [https://telegram.org/tos/bot-developers]

Esto se refiere a Bot API tokens. Para **cuentas MTProto personales** (user
accounts), la regla es diferente: Telegram permite tener varias cuentas siempre
que cada una sea operada por un humano real (o simule una). El riesgo es que si
una cuenta MTProto scrapea agresivamente y se identifica comportamiento
automatizado, Telegram puede marcarla como bot y banearla.

**Mitigación**: cada cuenta MTProto debe comportarse "humanamente" — delays
entre acciones, horarios variables, no responder a mensajes propios, no enviar
mensajes desde esas cuentas (solo leer).

### 4.4 Configuración operativa segura

```typescript
// apps/backend/src/kol/ingestion/infrastructure/config/scaling.config.ts

export const SCALING_CONFIG = {
  // Por cuenta MTProto
  maxChannelsPerAccount: 200,
  maxBackfillPerBatch: 100,
  backfillDelayBetweenKolMs: 60_000,   // 60s entre KOLs
  liveIngestDelayBetweenMsgsMs: 50,    // ~20 msg/s

  // Múltiples cuentas
  accounts: [
    {
      id: 'account-1',
      phoneNumber: '+15551234567',
      apiId: 11111,
      apiHash: 'aaa',
      sessionString: process.env.MTPROTO_SESSION_1!,
      assignedKolIds: ['kol-1', 'kol-2', ...],
    },
    {
      id: 'account-2',
      phoneNumber: '+15559876543',
      apiId: 22222,
      apiHash: 'bbb',
      sessionString: process.env.MTPROTO_SESSION_2!,
      assignedKolIds: ['kol-201', 'kol-202', ...],
    },
  ],

  // Health checks
  healthCheckIntervalMs: 300_000,       // cada 5 min
  floodWaitBackoffMultiplier: 2,       // duplicar delay si FloodWait
  maxFloodWaitSeconds: 3600,            // si supera, parar cuenta 1h
};
```

### 4.5 Cómo distribuir KOLs entre cuentas

Algoritmo recomendado:

```typescript
function distributeKols(
  kols: Kol[],
  accounts: MtprotoAccount[],
): Map<string, Kol[]> {
  // Sharding por kolId hash para que un KOL específico
  // siempre caiga en la misma cuenta (consistencia).
  const result = new Map<string, Kol[]>();
  for (const account of accounts) {
    result.set(account.id, []);
  }
  for (const kol of kols) {
    const hash = simpleHash(kol.id) % accounts.length;
    result.get(accounts[hash].id)!.push(kol);
  }
  return result;
}
```

Beneficio: si una cuenta se cae, solo pierdes 1/N de los KOLs.

---

## 5. Modelo de cobro a KOLs

### 5.1 ¿Cobrar a KOLs nuevos (onboarding)?

**Sí, recomendado.** Razones:

| Pro | Con |
|---|---|
| Filtra KOLs serios de scam channels | Friction reduce volumen de onboardings |
| Genera revenue inmediato | KOLs pueden percibir como "pagar para ser listado" |
| Crea tuité de "el primer KOL Fast Track" para marketing | Si cobras mucho, todos se van a la cola gratis |
| Cubre el costo de verificación manual | — |

**Pricing reference** (del incumbente del mercado):
- Free tier: gratis, 7–30 días de cola
- Fast Track one-time: 0.3–1 ETH o 100–500 USDT
- Fast Track anual: 2–5x el one-time

**Implementación**: en `telegram-bot/` con `StarsPaymentPort` (ver
`04-architecture-gaps.md §1.2`).

### 5.2 ¿Cobrar recurrente para que permanezcan?

**Sí, pero el modelo debe aportar valor, no ser "renta por aparecer".**

#### Modelo 5.2.A: SaaS para KOLs (recomendado)

| Tier | Precio | Incluye |
|---|---|---|
| **Free** | Gratis | Stats básicos, leaderboard inclusion, badge "Tracked" |
| **Verified** | 0.5 ETH/mes o 50 USDT/mes | Badge "Verified", priority en feed, custom branding en su stats page, advanced analytics (audience overlap, time-of-day performance, etc.) |
| **Pro** | 2 ETH/mes o 200 USDT/mes | Todo lo anterior + API access a sus propios datos + dedicated success manager + early access a features |

**Por qué funciona**:
- El Free tier captura a todos (incluyendo KOLs que no pagan).
- El Verified badge tiene valor reputacional (social proof).
- Los datos advanced son VALOR REAL para el KOL que quiere optimizar su canal.

**Por qué NO hacerlo como "paga o desapareces"**:
- Crea incentivo perverso: el KOL siente que le "chantajeas" con su propia data.
- Genera mala voluntad en la comunidad cripto (que es muy vocal en Twitter).
- Si desapareces un KOL que no pagó, otros KOLs temen y no se unen.

#### Modelo 5.2.B: Commission-based (alternativa)

En vez de cobrar fee fijo, cobras **% del revenue que el KOL genera vía tus referidos**:

- KOL tiene link de referido a Alpha Meta Pro (suscripción B2C).
- KOL recibe 20% de la suscripción de cada user que llegue vía su link.
- Tú cobras el 80% restante.

**Pro**: alineas incentivos. Si el KOL trae users de calidad, gana. Si no, no gana pero tampoco pierde.

**Con**: necesitas infraestructura de attribution + payouts recurrentes.

#### Modelo 5.2.C: Híbrido (lo que recomiendo)

- Onboarding fee: one-time Fast Track (0.5 ETH).
- Tier Verified: recurrente (0.5 ETH/mes) opcional con valor agregado.
- Revenue share: si KOL trae >10 subs B2C, automáticamente entra en revenue share.

Esto maximiza el ingreso inicial (onboarding) y el recurrente (Verified), sin
forzar la mano del KOL.

### 5.3 Cómo implementar el cobro recurrente

**Mecánica técnica**:

```
[KOL con Verified badge]
  └─► Suscripción activa (renews monthly)
        └─► Si falla el pago:
              ├─► Primer fallo: aviso "tu suscripción vence en 3 días"
              ├─► Segundo fallo (7 días): downgrade a Free
              ├─► Free tier: badge "Tracked" (no "Verified"), sin priority feed
              └─► Si paga de nuevo: upgrade automático a Verified
```

**Pasarela**:
- Para KOLs: USDT/crypto via TON o external (NOWPayments, Coinbase Commerce).
- NO Stars: el fee recurrente es un servicio B2B fuera del bot, no un digital
  good in-bot. Bot Dev §6.1 [https://telegram.org/tos/bot-developers].

**Implementación**: en `apps/backend/src/billing/` (nuevo BC) con
`SubscriptionService`, `PaymentProvider` port, `kol_subscription` table.

---

## 6. Riesgos del cobro a KOLs

| Riesgo | Mitigación |
|---|---|
| KOL reclama que es "venta de ranking" | ToS del onboarding debe ser claro: el fee es por **servicio de verificación + listing prioritario**, no por ranking. Tu ranking es algorítmico y objetivo. |
| KOL me denuncia a Telegram por "chantaje" | El cobro es opcional y claramente opt-in. Free tier existe. No chantaje. |
| KOLs exigen devolución si su win rate baja | ToS: "verified badge is not a guarantee of performance". |
| Competencia con SpyDefi (que también cobra) | Diferénciate en features, no en precio. |
| KOLs pagan una vez y abandonan | El modelo recurrente (Verified) mantiene engagement. |

---

## 7. Plan de implementación

### Fase 1 (semana 1): Compliance baseline

- [ ] Implementar 3 niveles de opt-in (bot ToS, outreach, fee)
- [ ] Tabla `kol_consent_log` con timestamp + versión ToS + IP
- [ ] Disclaimer en cada view de KOL en el frontend
- [ ] Methodology disclosure pública (1 página web)

### Fase 2 (semana 2): Multi-account infrastructure

- [ ] Soporte para N cuentas MTProto en config
- [ ] Sharding algorithm (hash-based)
- [ ] Health check + FloodWait backoff
- [ ] Account failover (si una cae, sus KOLs van a otra con delay)

### Fase 3 (semana 3): Onboarding flow

- [ ] `/track_my_channel` con Queue + Fast Track
- [ ] Verification step (KOL postea un mensaje único)
- [ ] `kol_subscription` table + Stripe/crypto billing

### Fase 4 (semana 4): Recurring KOL SaaS

- [ ] Verified tier UI
- [ ] Advanced analytics (audience overlap, time-of-day, etc.)
- [ ] Upgrade/downgrade flow
- [ ] Revenue share tracking (si modelo híbrido)

---

## 8. Próximo paso

Volver a `fix-1/solution.md` para cerrar el fix más urgente antes de empezar
a construir cualquiera de las features de este archivo.
