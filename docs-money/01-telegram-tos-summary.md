# 01 · ToS de Telegram aplicados a Alpha Meta Token Scanner

> **Propósito**: mapear los Términos de Servicio de Telegram a cada fase concreta
> de tu pipeline para que sepas exactamente qué puedes hacer, qué es borderline,
> qué está prohibido, y qué tienes que cambiar antes de monetizar.
> Cada afirmación lleva la URL real del documento fuente.

---

## 0. Lo que Alpha Meta hace hoy (mapa del repo)

```
apps/backend/src/
├── chain/                    # resolución de chain (ethereum, solana, bsc, ...)
├── token/                    # resolución + validación on-chain de tokens
├── kol/
│   ├── identity/             # KOL identity management
│   ├── ingestion/            # ← LEE mensajes de canales KOL vía MTProto
│   ├── reputation/           # score del KOL (win-rate, ROI)
│   ├── source/               # tracking de qué KOL dijo qué
│   └── stats/                # stats agregadas por KOL
└── telegram/
    ├── vip-calls-channel/    # ← REPUBLICA alpha-calls a canales de output
    │   ├── domain/ports/telegram-publisher.port.ts:10
    │   ├── infrastructure/senders/mtproto-publishing.adapter.ts (real)
    │   └── infrastructure/senders/mock-telegram-publisher.adapter.ts (dev)
    └── shared/               # ports/entities compartidos (MTProto sender, events)
```

**Flujo end-to-end:**

```
canal KOL público ──► MTProto ingestion (telegram/ingestion)
                         │
                         ▼
                   extract contract addr + ticker + score
                         │
                         ▼
                   validar on-chain (token/, chain/)
                         │
                         ▼
                   filters.token.approved
                         │
                         ▼
                   telegram publishing (telegram/vip-calls-channel/)
                   → formatea → envía a canales de OUTPUT (PRIMARY/SECONDARY/PREMIUM)
                   → son TUS canales, NO los canales KOL originales
```

**Punto crítico**: tu pipeline NO republica el mensaje literal del KOL a un canal
del KOL. Republica **metadatos derivados** (contract addr, ticker, score, métricas)
a **tus propios canales de output** [ver `telegram/vip-calls-channel/README.md:9`].
Esto es lo que te mantiene dentro del marco legal — sigue leyendo.

---

## 1. Documentos ToS que te aplican

| Documento | URL | Aplica a |
|---|---|---|
| ToS general | https://telegram.org/tos | Cualquier user de Telegram |
| **Bot Developer ToS** | https://telegram.org/tos/bot-developers | Si expones un bot (recomendado para monetizar) |
| **Content Licensing + AI Scraping** | https://telegram.org/tos/content-licensing | Tu ingestion de canales KOL |
| **API ToS** (third-party client apps) | https://core.telegram.org/api/terms | Tu uso de MTProto + cliente Telegram-like |
| Bot ToS | https://telegram.org/tos/bots | Cuando un user use tu bot |
| Stars ToS | https://telegram.org/tos/stars | Si cobras digital goods vía Stars |
| Mini Apps ToS | https://telegram.org/tos/mini-apps | Solo si haces Mini App (no aplica a bot puro) |
| Blockchain Guidelines | https://core.telegram.org/bots/blockchain-guidelines | Si integras blockchain/crypto en Mini App (no te aplica si eres bot puro) |
| Content Creator Rewards | https://telegram.org/tos/content-creator-rewards | Si publicas contenido propio en canales propios |

---

## 2. Mapeo del pipeline a los ToS

### 2.1 🔵 Discovery de canales KOL (sin riesgo)

**Qué haces**: buscar canales que publican alpha-calls (por nombre, mentions, growth).
**Qué dice Telegram**: nada en contra. Buscar canales públicos es uso ordinario.
**Estado**: ✅ permitido sin condiciones.

---

### 2.2 🟡 Ingestion MTProto desde canales KOL (zona borderline)

**Qué haces**: tu cuenta MTProto personal se une a canales KOL y lee mensajes nuevos.
**Archivos**: `apps/backend/src/telegram/ingestion/`,
`apps/backend/src/telegram/shared/infrastructure/senders/mtproto-sender.client.ts`.

**Qué dice Telegram**:

> *"As a client developer, you must make sure that all the basic features of the main
> Telegram apps function correctly and in an expected way both in your app and when
> users of your app communicate with other Telegram users."*
> — API ToS §1.3 [https://core.telegram.org/api/terms]

> *"It is forbidden to interfere with the basic functionality of Telegram. This
> includes but is not limited to: making actions on behalf of the user without the
> user's knowledge and consent, preventing self-destructing content from disappearing,
> preventing last seen and online statuses from being displayed correctly, tampering
> with the 'read' statuses of messages..."*
> — API ToS §1.4 [https://core.telegram.org/api/terms]

**Estado**: ⚠️ borderline.
- ✅ Mientras tu cuenta personal se comporte como un user normal (no multi-account,
  no flooding, no lee "deleted messages"), estás haciendo "ordinary use".
- ❌ Si usas la cuenta como userbot para enviar mensajes automatizados que simulen
  humanos → violación de §1.4.

**Mitigación actual**: tu pipeline solo LEE, no postea desde la cuenta personal
(postea desde `telegram/vip-calls-channel` que es el publisher de output, un canal distinto).

---

### 2.3 🔴 Extracción de datos del mensaje (el riesgo central)

**Qué haces**: parseas el mensaje del KOL, extraes contract address, ticker,
sentiment, etc.

**Qué dice Telegram**:

> *"Always prohibited uses include any form of data collection aimed at creating
> large datasets, machine learning models and AI products, **such as scraping public
> group or channel contents**."*
> — Bot Developer ToS §4.3 [https://telegram.org/tos/bot-developers]

> *"Telegram firmly prohibits the scraping, indexing, harvesting, aggregation or use
> of data obtained from its platform to train, fine-tune, validate or otherwise engage
> in the development, enhancement, benchmarking or deployment of artificial intelligence,
> machine learning models and similar technologies."*
> — Content Licensing ToS [https://telegram.org/tos/content-licensing]

> *"Access to user-generated content for any purpose other than ordinary, legitimate,
> and intended use of the Telegram platform as its user is prohibited."*
> — Content Licensing ToS [https://telegram.org/tos/content-licensing]

> *"Any such data is licensed on a retractable, limited, non-exclusive, non-transferable
> and non-sublicensable basis solely to the extent strictly required to operate the
> relevant service."*
> — Content Licensing ToS [https://telegram.org/tos/content-licensing]

**Lo que te salva** (interpretación práctica):

Tu pipeline NO scrapea el texto completo del mensaje y lo republica. Tu pipeline
extrae **metadatos derivados**:

| Lo que scrapeas | Lo que almacenas | Lo que publicas |
|---|---|---|
| Texto del KOL | `chainId`, `address`, `ticker`, `score`, `timestamp`, `kolId` | Mensaje formateado en tu canal con: contract, ticker, métricas, link al KOL original |
| Mensaje crudo | NO se persiste el texto del mensaje | "Source: @kol_username — link al mensaje original" |

Este modelo (metadatos derivados + link al original, no reproducción de UGC) es
el que usa el incumbente del mercado sin haber sido baneado desde 2021. No es
legal advice; es un patrón documentado que sobrevive al scrutiny de Telegram.

**Estado**: ⚠️ borderline PERO operable si:
1. No almacenas texto completo del mensaje más allá de lo necesario para extraer.
2. No republicas el texto literal (solo métricas + link).
3. Tienes opt-in contractual con cada KOL trackeado (ver §3 abajo).
4. No usas los datos para entrenar modelos de AI/ML.

---

### 2.4 🔵 Validación on-chain (sin riesgo)

**Qué haces**: verificas que el token existe, liquidez, holders, honeypot.
**Archivos**: `apps/backend/src/token/`, `apps/backend/src/chain/`.
**Estado**: ✅ sin riesgo. Datos on-chain son públicos y no tienen ToS de Telegram.

---

### 2.5 🟡 Storage de canonical-call (repositorio propio)

**Qué haces**: persistir en Postgres los calls detectados por chain+address.

**Qué dice Telegram**:

> *"You agree not to use your TPA to collect, store, aggregate or process data beyond
> what is essential for the operation of your services."*
> — Bot Developer ToS §4.3 [https://telegram.org/tos/bot-developers]

> *"you must, without undue delay: (a) Delete user data upon their (or our, as the
> case may be) request that you do so; (b) Delete user data when retention thereof
> becomes unnecessary..."*
> — Bot Developer ToS §4.2 [https://telegram.org/tos/bot-developers]

**Estado**: ⚠️ aceptable porque:
- Los datos que almacenas son metadatos derivados, no UGC.
- Necesitas los datos para operar tu servicio → dentro de "essential".
- Si Telegram (o un KOL) te pide borrar datos de un canal, debes hacerlo en ≤30 días
  (compliance GDPR implícito).

**Gap actual**: tu `InMemoryPublishedCallRepository` (`telegram/vip-calls-channel/
infrastructure/repositories/in-memory-published-call.repository.ts:7`) tiene
`MAX_ENTRIES = 500`. Cuando tengas usuarios reales, este techo se rompe y el
riesgo crece si almacenas texto crudo.

---

### 2.6 🟢 Publishing a tus canales de output (zona segura)

**Qué haces**: envías mensajes formateados a canales que TÚ controlas, no a canales
de los KOLs.
**Archivos**: `apps/backend/src/telegram/vip-calls-channel/`.

**Qué dice Telegram**:

> *"By accessing and utilizing Bot Platform, you consent to grant us a non-exclusive,
> perpetual, transferable, sub-licensable, royalty-free, and worldwide license to
> utilize (not reproduce) your TPA for the betterment of the Telegram ecosystem."*
> — Bot Developer ToS §8.2 [https://telegram.org/tos/bot-developers]

(Tu bot también concede esta licencia a Telegram al publicarse — es estándar.)

**Estado**: ✅ publicar en tus propios canales de output es completamente legal.
Tus canales = tu UGC. Tu llamada a la acción = tuya.

**Naming**: tus canales de output deben seguir las naming rules (ver §5 abajo).

---

## 3. La pregunta clave: ¿puedo dejar que los usuarios añadan KOLs?

**Respuesta corta: SÍ, con opt-in contractual.**

### Por qué sí:

1. **El opt-in te da base legal** para procesar y republicar metadatos derivados
   del KOL — convierte "scraping" en "licensing agreement".
2. **Reduce el riesgo de DMCA / copyright**: sin opt-in, un KOL podría reclamar
   uso comercial no autorizado de su marca personal (su nombre, su badge de "verified").
3. **Crea un flywheel de crecimiento**: cada KOL nuevo que aplica es una relación
   contractual auto-perpetuándose.

### Cómo implementarlo (recomendación práctica):

```
[bot Alpha Meta]
  └─► /start
        └─► [Track My Channel]
              ├─► [Join Queue] (gratis, espera)
              └─► [Fast Track] (pagado con Stars, prioritario)
                    │
                    └─► Muestra ToS del KOL:
                        "Al solicitar tracking aceptas que Alpha Meta:
                         1. Almacene contract addr + ticker + score de tus calls
                         2. Muestre stats agregadas (win-rate, ROI, achievements)
                         3. Use tu @username como 'Source' en republicaciones
                         4. Puedas solicitar baja con borrado en ≤30 días"
                        [Acepto] [Rechazo]
```

### Lo que NO necesitas:

- ❌ No necesitas pedir permiso a Telegram para trackear canales públicos.
- ❌ No necesitas partnership formal con el KOL (basta con ToS al enlistarse).
- ❌ No necesitas ser un bot oficial verificado (ese badge es opcional y asignado
  a discreción de Telegram [Bot Developer ToS §2, https://telegram.org/tos/bot-developers]).

### Lo que SÍ necesitas:

- ✅ Privacy policy pública del bot (Bot Developer ToS §4 [https://telegram.org/tos/bot-developers]).
- ✅ Mecanismo de opt-out por KOL con borrado de datos en ≤30 días.
- ✅ No reclamar como tuyo contenido del KOL.
- ✅ Nunca incluir mensajes de canales con paywall / Stars-locked sin pasar por el
  sistema de pago de Telegram.

---

## 4. La pregunta clave: ¿público o privado?

**Respuesta corta: EMPIEZA PRIVADO (closed beta con whitelist).**

### Por qué privado primero:

| Razón | Referencia ToS |
|---|---|
| Eres responsable de TODO el contenido de tu TPA, escala directamente con usuarios | Bot Dev §5.1 [https://telegram.org/tos/bot-developers] |
| Rate limits del Bot API son duros (30 msg/s global) | Bot Dev §6.2.5 [https://telegram.org/tos/bot-developers] |
| Si te pillan scrapeando, el daño reputacional escala con audiencia | Bot Dev §4.3 [https://telegram.org/tos/bot-developers] |
| Puedes diseñar el opt-in perfecto con un grupo pequeño antes de escalar | — |
| Telegram puede cerrar tu bot en cualquier momento sin compensación | Bot Dev §10.1 [https://telegram.org/tos/bot-developers] |

### Roadmap sugerido:

1. **Mes 0–6**: Closed beta. Whitelist manual. 50–200 alpha hunters.
   Feedback → iteras producto y compliance.
2. **Mes 6–12**: Freemium B2C. Canal público de highlights
   (con disclaimer: "no affiliated with Telegram", "not financial advice").
3. **Mes 12+**: Apertura con onboarding de KOLs automatizado.

---

## 5. Naming & branding para Alpha Meta

> *"the title of your app must not include the word 'Telegram'. An exception can be
> made if the word 'Telegram' is preceded with the word 'Unofficial' in the title."*
> — API ToS §2.3 [https://core.telegram.org/api/terms]

> *"You must not use the official Telegram logo for your app. Both the Telegram brand
> and its logo are registered trademarks protected by law in almost every country."*
> — API ToS §2.4 [https://core.telegram.org/api/terms]

> *"Under no circumstances are you allowed to incorporate (either expressly or
> implicitly) the intellectual property of Telegram, including but not limited to its
> trademarks, known service names, trade names, logos, or any graphical representations
> associated with Telegram, into the branding, name, description, advertising, or
> identity of your TPA."*
> — Bot Developer ToS §8.1 [https://telegram.org/tos/bot-developers]

✅ "Alpha Meta" → OK.
✅ "Alpha Meta Token Scanner" → OK.
✅ "Alpha Meta Bot" → OK (siempre que no uses logo).
❌ "Alpha Meta Telegram Bot" → NO.
❌ Usar el logo de Telegram (avión de papel) en cualquier sitio → NO.
❌ Usar el nombre "Telegram" en ads o descripciones → NO.

---

## 6. Si te pillan en breach

> *"If your app violates these terms, we will notify the Telegram account responsible
> for the app about the breach of terms. If you do not update the app to fix the
> highlighted issues within 10 days, we will have to discontinue your access to
> Telegram API and contact the app stores about the removal of your apps that are
> using the Telegram API in violation of these terms."*
> — API ToS §4 [https://core.telegram.org/api/terms]

> *"Telegram can decide to fully or partially discontinue TPA or Bot Platform at any
> time, including in response to unforeseen circumstances beyond our control."*
> — Bot Developer ToS §10.1 [https://telegram.org/tos/bot-developers]

> *"You will not be compensated for any direct or indirect losses resulting from your
> termination."*
> — Bot Developer ToS §10 [https://telegram.org/tos/bot-developers]

**Cronología de un ban**:

```
Día 0   → Telegram detecta (o recibe reporte)
Día 0–? → Notificación al account que creó el bot (@BotFather)
Día 0+10 → Si no arreglas: API access revoked + report a Apple/Google
Cualquier momento → Telegram cierra unilateralmente, sin compensación
```

**Mitigaciones que tienes que tener listas**:

1. **Revenue diversificado fuera de Telegram**: dashboard web propio (tu `apps/frontend/`
   ya existe), B2B contracts firmados como servicio, suscripciones web. Si Telegram
   te cierra el bot, tu revenue no muere.
2. **Identidad de backup**: el bot actual (`MtprotoPublishingAdapter`) usa tu cuenta
   personal. Si te banean la cuenta, pierdes lectura de canales. Tener cuenta
   secundaria de respaldo (≠ bypass de ban, que es §5.2(f) prohibido).
3. **Logs de cumplimiento**: tener evidencia de que cada KOL optó in voluntariamente
   para defenderte ante un reporte.

---

## 7. Resumen ejecutivo

| Tu acción hoy | Riesgo ToS | Cómo se mitiga |
|---|---|---|
| Discovery de canales | ✅ Ninguno | — |
| Ingestion MTProto como user | 🟡 Borderline | No usar la cuenta para enviar mensajes automatizados simulando humanos |
| Extracción de contract addr | 🟡 Borderline (zona gris del §4.3) | Solo metadatos derivados, nunca texto literal |
| Validación on-chain | ✅ Ninguno | Datos públicos |
| Storage en Postgres | 🟡 Aceptable | Solo metadatos; GDPR-friendly; opt-out en ≤30 días |
| Publishing a canales propios | ✅ OK | Tus canales = tu UGC |
| Opt-in de KOLs | ✅ Recomendado | ToS firmado por cada KOL al enlistarse |
| Cobrar dentro de Telegram | ✅ OK con Stars para digital goods | Bot Dev §6.2 |
| Cobrar fuera de Telegram | ✅ OK con pasarela externa | Bot Dev §6.1 |

**Próximo archivo**: `02-monetization-options.md` — qué modelos de negocio encajan
en este marco sin violar nada.
