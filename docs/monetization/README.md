# docs-money/ · Monetización de Alpha Meta Token Scanner

> Documentación iterativa sobre cómo monetizar el pipeline de Alpha Meta
> sin violar los ToS de Telegram.
>
> **Generado**: a partir de los ToS públicos de Telegram vigentes a la fecha
> de este commit. Los ToS cambian — verifica antes de tomar decisiones legales.

---

## TL;DR en 30 segundos

1. **Tu producto, definido legalmente**: *"Servicio de alertas cripto generado a
   partir de inteligencia agregada sobre KOLs de Telegram, entregado vía bot
   propio."* — Es UGC derivado, no scraping, si operas correctamente.
2. **Lo que monetiza**:
   - KOL Fast Track (Stars)
   - BuyBot B2B para proyectos (USDT/crypto externo)
   - Suscripciones premium (Stars)
   - Ads nativos en tus canales (externo)
   - Affiliate con trading bots (externo)
   - API B2B (externo)
3. **Lo que está prohibido** (riesgo de ban inmediato):
   - Scraping de mensajes para construir datasets / entrenar AI.
   - Vender el texto literal de los KOLs.
   - MLM / Ponzi / fake engagement.
   - Mini App con crypto non-TON.
   - Impersonar a Telegram o usar su marca.
4. **Antes de monetizar, haz compliance baseline** (ver archivo 03).

---

## Índice de archivos

| # | Carpeta / archivo | Qué cubre |
|---|---|---|
| 01 | [`01-telegram-tos-summary.md`](./01-telegram-tos-summary.md) | Mapeo ToS ↔ cada fase de tu pipeline (apps/backend/src/telegram-kol/, telegram-publishing/, token/, chain/) |
| 02 | [`02-monetization-options.md`](./02-monetization-options.md) | 8 modelos de negocio viables con pricing reference y análisis de riesgo |
| 03 | [`03-dos-and-donts.md`](./03-dos-and-donts.md) | Checklist operacional, patrones de código correcto/incorrecto, auto-auditoría mensual |
| 04 | [`04-architecture-gaps.md`](./04-architecture-gaps.md) | Lo que tienes hoy + lo que falta construir + roadmap técnico en 7 fases |
| 05 | [`05-kol-onboarding-legal-limits-and-monetization.md`](./05-kol-onboarding-legal-limits-and-monetization.md) | Legal de leer CAs sin opt-in, autorización, riesgos de reputación, modelos de cobro a KOLs |
| 06 | [`06-rate-limits-verified.md`](./06-rate-limits-verified.md) | Límites de Telegram verificados contra fuentes oficiales + ban prevention |
| fix-1 | [`fix-1/`](./fix-1/) | **🚧 Fix en progreso** — descripción del riesgo de mayor severidad (Bot Dev §4.3). Título de carpeta pendiente hasta tener `solution.md`. |

### Fixes en progreso

Cada fix vive en su propia carpeta `fix-N/` con dos archivos:
- `problem.md` — qué está mal, evidencia en el código, ToS que viola, riesgo de no arreglarlo.
- `solution.md` — pasos concretos para arreglarlo, código antes/después, tests, plan de despliegue.

La carpeta se renombra a un título descriptivo cuando ambos archivos están listos.

| Carpeta | Estado | Severidad |
|---|---|---|
| `fix-1/` | 🟡 `problem.md` listo · `solution.md` listo (pendiente de implementación) | 🔴 Crítica |

---

## Estructura del repo

```
docs-money/
├── README.md                            ← este archivo
├── 01-telegram-tos-summary.md
├── 02-monetization-options.md
├── 03-dos-and-donts.md
├── 04-architecture-gaps.md
├── 05-kol-onboarding-legal-limits-and-monetization.md
├── 06-rate-limits-verified.md           ← NEW
├── kols/                                ← one-off research (vacío hasta ejecutar script)
│   └── README.md                        ← cómo poblarlo y cómo borrarlo
└── fix-1/                               ← fix en progreso (título TBD)
    ├── problem.md                       ✓ diagnóstico completo
    └── solution.md                      ✓ listo para implementar
```

```
scripts/
├── cleanup-ports.mjs
└── fetch-kol-samples.mjs                ← one-off: descarga mensajes de KOLs para análisis de formato
```

---

## Bibliografía completa (URLs verificadas)

### Telegram — Términos de Servicio

| Documento | URL | Usado en |
|---|---|---|
| ToS general | https://telegram.org/tos | 01 |
| Bot ToS (usuario final) | https://telegram.org/tos/bots | 01 |
| **Bot Developer ToS** | https://telegram.org/tos/bot-developers | 01, 02, 03, 04 |
| **Content Licensing + AI Scraping** | https://telegram.org/tos/content-licensing | 01, 03 |
| Content Creator Rewards | https://telegram.org/tos/content-creator-rewards | 01, 02 |
| Stars ToS | https://telegram.org/tos/stars | 01, 02 |
| Mini Apps ToS | https://telegram.org/tos/mini-apps | 01 |
| **API ToS** (third-party client apps) | https://core.telegram.org/api/terms | 01, 03 |
| **Blockchain Guidelines** | https://core.telegram.org/bots/blockchain-guidelines | 01, 02 |

### Telegram — Mecánicas operativas

| Recurso | URL | Usado en |
|---|---|---|
| @BotFather | https://t.me/BotFather | 04 |
| Bot API overview | https://core.telegram.org/bots/api | 04 |
| Bot payments | https://core.telegram.org/bots/payments | 04 |
| TON Connect SDK | https://docs.ton.org/v3/guidelines/ton-connect/overview | 02 |

### Telegram — Referencias de producto

| Recurso | URL | Usado en |
|---|---|---|
| Telegram Stars announcement | https://telegram.org/blog/telegram-stars | 02 |
| Content Creator Rewards launch | https://telegram.org/blog/mini-app-bar-paid-media-and-more | 02 |
| Sponsored messages API | https://core.telegram.org/api/sponsored-messages | 01 |

---

## Reglas de este directorio

1. **Cada afirmación factual lleva URL real** entre corchetes al final de la
   oración. Si no la lleva, está marcada `[TODO: verificar]`.
2. **No se incluye advice legal profesional**. Esto es análisis de ToS
   públicos para decisión de producto. Para jurisdicciones específicas
   (US securities, EU MiCA, UK FCA, etc.) consulta abogado.
3. **Iteración incremental**: cada archivo se edita por separado.
   Refactors se hacen en commits separados para mantener historial limpio.
4. **Si un ToS cambia**, el archivo afectado se marca con `[OUTDATED]`
   en el header y se actualiza antes de cualquier lanzamiento.

---

## Disclaimer

> **No soy tu abogado**. Este documento es análisis de Términos de Servicio
> públicos para informar decisiones de producto y arquitectura. Para advice
> legal vinculante (especialmente sobre securities, securities laws de tokens,
> GDPR en jurisdicciones específicas, KYC/AML), consulta con un abogado
> especializado en cripto/TMT en tu jurisdicción.
>
> Telegram actualiza sus ToS sin aviso. Antes de tomar decisiones críticas,
> verifica la versión vigente en las URLs listadas arriba.

---

## Próximos pasos sugeridos

1. Lee `01-telegram-tos-summary.md` para entender el marco legal aplicable.
2. Lee `02-monetization-options.md` y elige 2–3 modelos prioritarios.
3. Lee `03-dos-and-donts.md` y empieza por la Fase 0 del checklist
   (compliance baseline).
4. Lee `04-architecture-gaps.md` y crea issues por cada gap del roadmap.
5. Lee `05-kol-onboarding-legal-limits-and-monetization.md` antes de
   tocar el sistema de KOLs o diseñar el onboarding.
6. **Ejecuta `scripts/fetch-kol-samples.mjs`** desde tu máquina local
   (no desde CI/servidor) para capturar el formato de los KOLs de
   referencia. Borra los datos después.
7. Lee `fix-1/problem.md` y decide si escribimos `solution.md` antes de
   seguir con más fixes.
8. **Antes de tocar código de pagos**: revisa la propuesta con un abogado
   si vas a aceptar USDT/crypto directamente.
