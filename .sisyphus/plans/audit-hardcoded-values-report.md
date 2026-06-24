# Reporte: Valores hardcodeados en el flujo publish/reject (Tokens + KOLs)

> **TL;DR**: 40+ valores hardcodeados en 4 archivos controlan scoring, gating, y reputación. Todos candidatos a migrar a una capa de configuración dinámica.
>
> **Scope auditado**: solo `apps/backend/src/`. Solo valores críticos. Sin auth (acceso por Tailscale).

## Resumen ejecutivo

| Categoría | BC | Archivo principal | Valores |
|---|---|---|---|
| Scoring de tokens | `token/scoring` | `application/handlers/score-token.use-case.ts` | 18 bonos + 4 penalties + 3 caps + 1 multiplier |
| Threshold del gate | `token/token-gating` | `application/handlers/apply-filters.use-case.ts` | 5 config + 3 thresholds + 1 honeypot heuristic + 2 chains |
| Reputación de KOL | `telegram-kol/reputation` | `domain/value-objects/kol-reputation.vo.ts` | 2 thresholds + 4 confidence buckets + 1 default |
| Listas de KOL | `telegram-kol/reputation` | `infrastructure/known-kol/default-known-kol.registry.ts` | 9 KNOWN_GOOD + 2 KNOWN_BAD |
| Fórmula score | `token/scoring` | `score-token.use-case.ts:65,342-345` | 1 base + 1 multiplier |
| **TOTAL** | | | **~50 valores** en **5 archivos** |

---

## 1. Scoring de tokens (`token/scoring`)

Archivo: `apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts`

### 1.1 Base y constantes globales
| Constante | Valor | Línea | Notas |
|---|---|---|---|
| `BASE_SCORE` | `50` | `:65` | Score inicial antes de bonos/penalidades |

### 1.2 Bonos por liquidez (`liquidityBonus`)
| Factor | Threshold | Delta | Línea |
|---|---|---|---|
| `LIQUIDITY_HIGH` | `liq >= 50_000` | `+20` | `:137-145` |
| `LIQUIDITY_MEDIUM` | `liq >= 10_000` | `+10` | `:146-154` |
| `LIQUIDITY_LOW` | `liq >= 1_000` | `+5` | `:155-163` |
| `LIQUIDITY_INSUFFICIENT` | `liq < 1_000` | `-10` | `:164-170` |

### 1.3 Bonos por holders (`holdersBonus`)
| Factor | Threshold | Delta | Línea |
|---|---|---|---|
| `HOLDERS_HIGH` | `>= 1000` | `+15` | `:178-186` |
| `HOLDERS_MEDIUM` | `>= 100` | `+8` | `:187-195` |
| `HOLDERS_LOW` | `>= 10` | `+3` | `:196-204` |
| `HOLDERS_NONE` | `=== 0` | `-10` | `:205-209` |

### 1.4 Bonos por market cap (`marketCapBonus`)
| Factor | Threshold | Delta | Línea |
|---|---|---|---|
| `MC_HIGH` | `>= 1_000_000` | `+10` | `:218-222` |
| `MC_MEDIUM` | `>= 100_000` | `+5` | `:223-227` |
| `MC_LOW` | `>= 10_000` | `+2` | `:228-232` |

### 1.5 Bonos por volumen (`volumeBonus`)
| Factor | Threshold | Delta | Línea |
|---|---|---|---|
| `VOLUME_HIGH` | `>= 50_000` | `+5` | `:241-249` |
| `VOLUME_LOW` | `>= 10_000` | `+2` | `:250-258` |

### 1.6 Bonos por buzz (`buzzBonus`)
| Factor | Threshold | Delta | Línea |
|---|---|---|---|
| `MULTI_CHANNEL_BUZZ` | `sources >= 3` | `+10` | `:268-274` |
| `TWO_CHANNELS` | `sources == 2` | `+5` | `:275-281` |
| `HIGH_MENTION_COUNT` | `mentions >= 5` | `+5` | `:283-289` |
| `MULTIPLE_MENTIONS` | `mentions >= 2` | `+2` | `:290-296` |

### 1.7 Penalidades por signals (`signalPenalties`)
| Severity | Penalty | Línea |
|---|---|---|
| `CRITICAL` | `-15` | `:312-314` |
| `HIGH` | `-8` | `:315-317` |
| `MEDIUM` | `-4` | `:318-320` |
| `LOW` | `-1` | `:321-323` |

**El `factor` emitido es dinámico**: `SIGNAL_${s.type}` (`:328`). El tipo es libre, no validado contra enum.

### 1.8 Multiplicador por reputación de canal
Función: `reputationMultiplier(avgRep: number)` (`:337-346`)

| avgRep | multiplier |
|---|---|
| `0.5` | `1.0` |
| `0.9` | `1.12` |
| `1.0` | `1.15` |
| `0.1` | `0.88` |

Fórmula: `avgRep >= 0.5 ? 1 + (avgRep - 0.5) * 0.3 : 1 - (0.5 - avgRep) * 0.3`

Constantes de la fórmula:
- Pivot: `0.5` (neutral)
- Slope: `0.3` (lineal en [0.5..1.5] → [0.85..1.15])
- Rango output: `0.85..1.15` (implícito por construcción)

### 1.9 Cap por security flag (`securityFlagCap`)
| Flag | Cap | Línea |
|---|---|---|
| `SCAM` | `5` | `:351` |
| `SUSPICIOUS` | `30` | `:352` |
| `UNKNOWN` | `20` | `:353` |
| `LEGITIMATE` | `100` | `:354` |

### 1.10 Clamp final
| Bound | Valor | Línea |
|---|---|---|
| Mínimo | `0` | `:99` |
| Máximo | `100` | `:100` |

### 1.11 ScoreTier thresholds (en `domain/value-objects/score-tier.vo.ts`)
| Score range | Tier |
|---|---|
| `>= 80` | `STRONG` |
| `>= 60` | `DECENT` |
| `>= 40` | `NEUTRAL` |
| `>= 20` | `RISKY` |
| `< 20` | `AVOID` |

---

## 2. Token gating (`token/token-gating`)

Archivo: `apps/backend/src/token/token-gating/application/handlers/apply-filters.use-case.ts`

### 2.1 `DEFAULT_FILTER_CONFIG` (constante exportada)
```typescript
// :21-27
export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  minScore: 50,                  // :22
  maxRiskWeight: 100,            // :23
  minCompleteness: 0.3,          // :24
  blockedClassifications: ['SCAM', 'UNKNOWN'],  // :25
  enableBlacklist: true,         // :26
};
```

### 2.2 Thresholds adicionales
| Constante | Valor | Línea |
|---|---|---|
| `BUNDLERS_HIGH_THRESHOLD` | `30` (% bundlers) | `:44` |
| `INSIDERS_HIGH_THRESHOLD` | `50` (% insiders) | `:45` |
| `BONDING_INCOMPLETE_THRESHOLD` | `99` (% bonding, solo pumpfun) | `:46` |

### 2.3 Honeypot heuristic
```typescript
// :124
if (input.score < 10 && input.riskWeight >= 80) {
  // → HONEYPOT_SUSPECTED
}
```

### 2.4 Publishable chains
```typescript
// :77-80
public static readonly PUBLISHABLE_CHAINS: ReadonlyArray<string> = [
  'ethereum',
  'solana',
];
```

### 2.5 Blacklist hardcoded (placeholder)
Archivo: `apps/backend/src/token/token-gating/infrastructure/adapters/in-memory-blacklist.adapter.ts:15-25`

Contiene 1 entry (Wrapped SOL con comentario "example, not actually blacklisted"). Es un placeholder de v1.

---

## 3. KOL reputation (`telegram-kol/reputation`)

### 3.1 Thresholds en `kol-reputation.vo.ts`
| Concepto | Valor | Línea | Notas |
|---|---|---|---|
| Default score | `0.5` | `:63` | `KolReputation.empty(kolId)` |
| Default confidence | `'LOW'` | `:71` | |
| `isTrusted` threshold | `score >= 0.7 && confidence !== 'LOW'` | `:108-109` | |
| `isSuspicious` threshold | `score <= 0.3 && confidence !== 'LOW'` | `:111-112` | |

### 3.2 Confidence buckets (call counts)
Archivo: `apps/backend/src/telegram-kol/reputation/domain/services/recompute-kol-reputation.service.ts:60-63`

| totalCalls | Confidence |
|---|---|
| `0-4` | `LOW` |
| `5-19` | `MEDIUM` |
| `20-49` | `HIGH` |
| `50+` | `VERY_HIGH` |

### 3.3 KNOWN_GOOD list
Archivo: `apps/backend/src/telegram-kol/reputation/infrastructure/known-kol/default-known-kol.registry.ts:18-28`

| kolId | Score |
|---|---|
| `spydefi` | `0.95` |
| `whaleinsiders` | `0.9` |
| `alpha_calls` | `0.85` |
| `sol_calls` | `0.85` |
| `defi_alpha_hub` | `0.85` |
| `gem_finder` | `0.8` |
| `onchainalpha` | `0.9` |
| `smart_trader_calls` | `0.85` |
| `pepe` | `0.6` |

### 3.4 KNOWN_BAD list
Archivo: `default-known-kol.registry.ts:30-33`

| kolId |
|---|
| `free_airdrop_spam` |
| `pump_guaranteed` |

### 3.5 Score formula (en `recompute-kol-reputation.service.ts:55`)
```typescript
rawScore = 0.5 + avgOutcomeWeight * 0.5
// luego clamp a [0, 1]
```
- Base: `0.5`
- Multiplicador: `0.5`

---

## 4. Otros valores relevantes (no críticos, fuera de scope)

Estos **no** entran en este plan pero vale documentar:

- `MaxEntries = 500` en repos in-memory — es limit, no regla de negocio
- `EVENT_DEBOUNCE_MS` y similares en event handlers — son performance, no reglas
- TTLs de cache (no hay cache actualmente) — N/A
- Cron schedules en call-tracking — operativo, no regla de scoring

---

## 5. Cosas que NO son hardcodeadas (correctamente constantes)

- Chain IDs (`solana`, `ethereum`) en la lista de publishable — sí están hardcoded, pero es la fuente de verdad de la red
- `0..1` y `0..100` clamps de score — son invariantes del dominio, no configurables
- Enum de severities (`'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'`) — sí está como literal, pero cambiarlo es breaking type-level
- Factor `factor` strings en breakdown (`CHANNEL_REPUTATION`, `SECURITY_FLAG_CAP`) — son identificadores, no valores

---

## 6. Recomendación: qué migrar primero

**Tier 1 (crítico, hacer primero)**:
1. `DEFAULT_FILTER_CONFIG` (5 valores) — gate directo publish/reject
2. Scoring bonuses (18 valores) — afecta cuántos tokens pasan el filtro
3. Signal penalties (4 valores) — afecta cuántos tokens fallan
4. Security flag caps (3 valores) — safety net

**Tier 2 (importante, segundo)**:
5. Reputation multiplier formula — afecta todos los scores
6. KOL reputation thresholds (0.7/0.3) — afecta KNOWN_GOOD
7. Honeypot heuristic (10/80) — safety
8. Publishable chains (2) — gate duro
9. BUNDLERS/INSIDERS/BONDING thresholds (3) — heurísticas de riesgo

**Tier 3 (nice-to-have, opcional)**:
10. KNOWN_GOOD/KNOWN_BAD lists (9+2) — actualmente funciona con registry in-code
11. Confidence buckets (4) — afecta cálculo de KOL score
12. KOL reputation formula constants (0.5 base, 0.5 slope)

---

## 7. Infraestructura confirmada (de la exploración)

- **NestJS**: 11.0.1
- **TypeORM**: 0.3.30
- **`@nestjs/typeorm`**: 11.0.2
- **`synchronize: true`** (default en dev) — no hay migrations folder, TypeORM auto-crea schema
- **Sin auth/guards** — confirmado por grep
- **Sin cache** — confirmado por grep
- **Sin config dinámica previa** — no existen entities tipo `settings`/`config`/`app_config`
- **Global ValidationPipe**: sí, con `whitelist:true, forbidNonWhitelisted:true, transform:true`
- **Patrón hexagonal**: `api/` + `application/` + `domain/` + `infrastructure/`
- **EventEmitter2** global, eventos in-process
- **Tests**: 306 Jest tests, repos in-memory por default
- **Sin outbox** — `save` + `publishAll` no son atómicos (caveat existente, fuera de scope)

---

## 8. Out of scope (explícitamente)

- Cache de settings en Redis (in-memory es suficiente)
- Auth en `/settings/*` (Tailscale = perímetro)
- Outbox pattern (problema pre-existente)
- Frontend UI para los endpoints (no pedido)
- Multi-binding de blacklist providers externos (GoPlus/Chainabuse) — solo blacklist hardcoded
- ML scoring (extensión sugerida en README scoring, fuera de scope)
