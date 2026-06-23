# Draft: Frontend Configuration UI para Score/Factors/Filters

## Contexto del Proyecto
- Monorepo: NestJS backend + React frontend
- Pipeline de alpha-calls de Telegram para tokens on-chain
- Sistema de scoring 0-100 con breakdown de factores
- Filtros para APPROVED/REJECTED

## Parámetros Identificados

### 1. Score Configuration
- **Base score**: 50 (default)
- **Score thresholds**: minScore para top tokens (default 70)
- **Classification caps**: SCAM→5, UNKNOWN→20, otros→100

### 2. Factors (Bonus/Penalty)
**Bonuses:**
- liquidityBonus: ≥50k:+20, ≥10k:+10, ≥1k:+5, <1k:-10
- holdersBonus: ≥1000:+15, ≥100:+8, ≥10:+3, 0:-10
- marketCapBonus: ≥1M:+10, ≥100k:+5, ≥10k:+2
- volumeBonus: ≥50k:+5, ≥10k:+2
- buzzBonus: 3+ sources:+10, 2 sources:+5; 5+ mentions:+5, 2+ mentions:+2

**Penalties (signals):**
- CRITICAL:-15, HIGH:-8, MEDIUM:-4, LOW:-1

**Multiplier:**
- reputationMultiplier: 0.5→1.0, 0.9→1.12, 1.0→1.15

### 3. Filters
- Score threshold para APPROVED (configurable)
- Blacklist de tokens/addresses
- Honeypot analysis enabled/disabled
- Risk checks enabled/disabled
- Chain filters (which chains to process)

## Archivos Relevantes
- Scoring use-case: `apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts`
- Filters: `apps/backend/src/token/token-gating/`
- API controller: `apps/backend/src/token/scoring/api/http/scoring.controller.ts`
- Frontend types: `apps/frontend/src/entities/token-score/model/types.ts`

## Decisiones Confirmadas
- **Persistencia**: Base de datos (TypeORM)
- **UI**: Formulario dinámico (sliders, inputs organizados)
- **Alcance**: Presets predefinidos (e.g., Conservador, Moderado, Agresivo, Custom)

## Propuesta de Presets
```typescript
interface ScoringPreset {
  id: string;
  name: string;
  description: string;
  scoring: ScoringConfig;
  filters: FilterConfig;
}

const presets: ScoringPreset[] = [
  {
    id: 'conservative',
    name: 'Conservador',
    description: 'Solo los mejores tokens, mínimo riesgo',
    scoring: { base: 50, minScore: 85, ... },
    filters: { scoreThreshold: 80, blacklist: [...], ... }
  },
  {
    id: 'moderate', 
    name: 'Moderado',
    description: 'Balance riesgo/rendimiento',
    scoring: { base: 50, minScore: 70, ... },
    filters: { scoreThreshold: 65, ... }
  },
  {
    id: 'aggressive',
    name: 'Agresivo',
    description: 'Más oportunidades, mayor riesgo',
    scoring: { base: 50, minScore: 50, ... },
    filters: { scoreThreshold: 45, ... }
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Configuración manual',
    scoring: { ... },
    filters: { ... }
  }
];
```

## Arquitectura Propuesta
1. **Backend**: 
   - Entity para Configuration (preset_id, config_json)
   - Endpoints CRUD: GET/POST /config/presets
   - Endpoints para aplicar preset actual

2. **Frontend**:
   - Página de Settings con selector de preset
   - Formulario de configuración por categoría
   - Preview del score resultante (opcional)