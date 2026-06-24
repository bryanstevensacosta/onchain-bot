# Work Plan: Dynamic Settings Module

> **TL;DR**: Migrar ~50 valores hardcodeados en 5 archivos a una capa de configuración dinámica (PostgreSQL + REST CRUD bajo `/settings/*`). Sin auth (Tailscale). Hot-reload con cache en memoria.
>
> **Deliverables**:
> - Reporte de hallazgos: `audit-hardcoded-values-report.md` (escrito, validado contra código real)
> - Nuevo módulo `SettingsModule` con 4 entities (signals, scoring_thresholds, settings_filters, settings_audit_log)
> - `SettingsService` con cache + invalidation + audit
> - Refactor de `ScoreTokenUseCase`, `ApplyFiltersUseCase`, `KolReputation`, `DefaultKnownKolRegistry` con **backward compat** (fallback a constantes)
> - Endpoints REST CRUD bajo `/settings/*`
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 3 waves después de foundation
> **Critical Path**: Wave 0 → Wave 1 → Wave 2 → Wave 3 → Wave 4 → F1-F7

---

## Context

### Original Request
> "busca todos los valores hardcodeados en el backend que podrían ser APIs como por ejemplo score, filter, gating"
>
> "por ejemplo Factors: `SIGNAL_LOW_LIQUIDITY: -4 (MEDIUM risk)`, `SIGNAL_NO_NAME: -1 (LOW risk)` — me gustaría poder configurarlo"
>
> "También KOL scoring" — mismo patrón para KOLs
>
> "editar/crear signals nuevos" desde admin (CRUD completo de signals)
>
> "esos endpoints son privados, accedemos por Tailscale, no necesitamos auth"
>
> "esos endpoints son privados, accedemos por Tailscale, no necesitamos auth"
>
> "esos endpoints son privados, accedemos por Tailscale, no necesitamos auth"

### Decisiones del usuario
- Scope: solo backend NestJS
- Foco: pipeline publish/reject de tokens + scoring de KOLs
- Output: reporte + propuesta de arquitectura
- Solo valores críticos
- Prefijo: `/settings/*` (no `/admin/*`, no `/config/*`, no `/rules/*`)
- Sin auth (Tailscale = perímetro)
- CRUD completo de signals (crear nuevos desde admin)

### Research Findings (validado contra código real)
Ver reporte completo: `.sisyphus/plans/audit-hardcoded-values-report.md`

**Hallazgos clave** (5 archivos, ~50 valores):
1. `score-token.use-case.ts` (356 líneas) — fórmula completa hardcoded: 18 bonos, 4 penalties, 3 caps, 1 multiplier
2. `apply-filters.use-case.ts` (216 líneas) — `DEFAULT_FILTER_CONFIG` (5 valores) + 3 thresholds + 1 honeypot heuristic + 2 publishable chains
3. `kol-reputation.vo.ts` (126 líneas) — 2 thresholds (0.7/0.3) + 4 confidence buckets
4. `default-known-kol.registry.ts` (42 líneas) — 9 KNOWN_GOOD + 2 KNOWN_BAD
5. `recompute-kol-reputation.service.ts` — score formula constants

**Infraestructura confirmada**:
- NestJS 11.0.1, TypeORM 0.3.30
- `synchronize: true` en dev (auto-crea schema)
- Sin auth/guards, sin cache, sin migrations folder
- Patrón hexagonal estricto (`api/`, `application/`, `domain/`, `infrastructure/`)
- EventEmitter2 global, eventos in-process
- 306 tests Jest existentes
- Global ValidationPipe con `whitelist: true`

### Metis Review
**Gaps identificados**:
1. El BC se llama `FiltersModule` (no `TokenGatingService` como decía el plan anterior)
2. El path real es `apps/backend/src/token/token-gating/` (no `token-gating-service`)
3. KOL reputation BC es `telegram-kol/reputation/`, separado de `telegram-kol/identity/`
4. `KNOWN_GOOD`/`KNOWN_BAD` están en una clase que extiende `KnownKolPort` (no constantes sueltas)
5. `synchronize: true` significa que podemos agregar entities sin migration explícita (en dev). Para prod habría que escribir migration.

**Riesgos**:
- Si los cambios en el refactor rompen la fórmula de scoring, los veredictos APPROVED/REJECTED cambian — esto rompe el contrato con `telegram-publishing` que consume `filters.token.approved`
- Si los cambios rompen la API de `KolReputation.isTrusted/isSuspicious`, el adapter de scoring se comporta distinto
- El test `apply-filters.use-case.spec.ts` cubre los 7 gates — refactor debe preservar outputs

---

## Work Objectives

### Core Objective
Hacer configurables en runtime (sin redeploy) los ~50 valores hardcodeados en 5 archivos que controlan scoring, gating, y reputación.

### Concrete Deliverables

**Fase 0 — Reporte**:
- [x] `audit-hardcoded-values-report.md` (validado contra código real)

**Fase 1 — Schema & entities**:
- 4 entities TypeORM en `apps/backend/src/settings/`:
  - `SignalEntity` (signals: id, code, name, penalty, risk_level, enabled, applies_to, timestamps)
  - `ScoringThresholdEntity` (scoring_thresholds: id, scope, min_score, max_score, decision)
  - `SettingsFilterEntity` (settings_filters: id, type, value, scope, enabled, notes)
  - `SettingsAuditLogEntity` (settings_audit_log: id, entity_type, entity_id, action, before, after, source_ip, created_at)
- DTOs con `class-validator`
- Mappers bidireccionales

**Fase 2 — SettingsService core**:
- `SettingsModule` registrado en `AppModule`
- `SettingsService` con:
  - `getSignalsForScope(appliesTo): SignalConfig[]` (cached)
  - `getSignal(code, appliesTo): SignalConfig | null` (cached)
  - `getThresholds(scope): ThresholdConfig[]` (cached)
  - `getFilters(type, scope): FilterConfig[]` (cached)
  - `getBaseConfig(scope): { minScore, maxRiskWeight, minCompleteness, blockedClassifications, enableBlacklist, baseScore, multiplierPivot, multiplierSlope }`
  - `getSecurityCaps(): { SCAM: 5, SUSPICIOUS: 30, UNKNOWN: 20, LEGITIMATE: 100 }`
  - `getKOLThresholds(): { trustedScore: 0.7, suspiciousScore: 0.3 }`
  - `getKOLConfidenceBuckets(): { LOW: 0..4, MEDIUM: 5..19, HIGH: 20..49, VERY_HIGH: 50+ }`
  - `getKOLReputationFormula(): { base: 0.5, slope: 0.5 }`
  - `getKnownKOLs(): { good: Map<kolId, score>, bad: Set<kolId> }`
  - `getPublishableChains(): string[]`
  - `getHoneypotHeuristic(): { scoreBelow: 10, riskWeightAbove: 80 }`
  - `getExtraThresholds(): { BUNDLERS: 30, INSIDERS: 50, BONDING: 99 }`
- Cache in-memory con TTL configurable (default 30s)
- Invalidación explícita en mutaciones
- Audit log automático en mutaciones con `source_ip`

**Fase 3 — Refactor con backward compat**:
- `ScoreTokenUseCase`: leer signals/thresholds/multiplier/caps desde `SettingsService` con fallback a constantes
- `ApplyFiltersUseCase`: leer `DEFAULT_FILTER_CONFIG` + thresholds + honeypot + publishable chains desde settings
- `KolReputation` VO: leer thresholds desde settings
- `DefaultKnownKolRegistry`: leer KNOWN_GOOD/KNOWN_BAD desde settings
- `recompute-kol-reputation.service.ts`: leer confidence buckets y formula constants desde settings
- **Backward compat**: si `SettingsService` no encuentra el valor → constante hardcoded + log warning (no romper comportamiento actual)

**Fase 4 — REST endpoints**:
- `SettingsController` bajo `/settings`:
  - `GET /settings/signals?appliesTo=token|kol`
  - `POST /settings/signals`
  - `PATCH /settings/signals/:id`
  - `DELETE /settings/signals/:id`
  - `GET /settings/thresholds` / `POST` / `PATCH` / `DELETE`
  - `GET /settings/filters` / `POST` / `PATCH` / `DELETE`
  - `GET /settings/audit?entityType=...&since=...&limit=...` (read-only)
- DTOs con `class-validator`
- **Sin guard de auth**

**Fase 5 — Verificación**:
- F1: build + tsc
- F2: tests existentes pasan
- F3: smoke test hot-reload de signal
- F4: smoke test hot-reload de threshold
- F5: audit log registra mutaciones
- F6: backward compat (DB vacía → comportamiento idéntico)
- F7: README actualizado

### Must Have
- [ ] Signals CRUD completo (crear nuevos)
- [ ] Thresholds CRUD
- [ ] Filters CRUD
- [ ] Hot-reload funciona
- [ ] Audit log con `source_ip`
- [ ] Sin auth
- [ ] Backward compat con constantes hardcoded (fallback)
- [ ] No rompe tests existentes

### Must NOT Have (Guardrails)
- ❌ Sin auth en `/settings/*` (Tailscale)
- ❌ Sin prefijo `/admin/*` (decidido)
- ❌ Sin key-value genérico (signals/thresholds/filters son entidades)
- ❌ Sin refactor de fórmula de scoring (solo cambiar origen de valores)
- ❌ Sin cambios en la API pública (no breaking changes)
- ❌ Sin Redis u otro sistema externo
- ❌ Sin frontend
- ❌ Sin tests nuevos (refactor de código, no bugfix)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Jest, 306 tests)
- **Automated tests**: NO nuevos — refactor de código, no bugfix
- **Agent-Executed QA**: ALWAYS vía curl + tsc + npm test

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (foundation — paralelizable):
├── Task 0.1: Crear 4 entities TypeORM
├── Task 0.2: Crear 6 DTOs con class-validator
├── Task 0.3: Crear 4 mappers bidireccionales
└── Task 0.4: Registrar en PERSISTED_ENTITIES + SettingsModule skeleton

Wave 1 (SettingsService core — secuencial dentro, paralelizable fuera):
├── Task 1.1: SettingsService con cache in-memory
├── Task 1.2: Métodos de invalidación
├── Task 1.3: AuditService (helper para log)
└── Task 1.4: Tests del service (mockeando repos)

Wave 2 (Refactor con backward compat — paralelizable):
├── Task 2.1: ScoreTokenUseCase lee de SettingsService
├── Task 2.2: ApplyFiltersUseCase lee de SettingsService
├── Task 2.3: KolReputation lee thresholds de SettingsService
├── Task 2.4: DefaultKnownKolRegistry lee de SettingsService
└── Task 2.5: recompute-kol-reputation.service.ts lee de SettingsService

Wave 3 (REST endpoints — paralelizable):
├── Task 3.1: SettingsController signals CRUD
├── Task 3.2: SettingsController thresholds CRUD
├── Task 3.3: SettingsController filters CRUD
├── Task 3.4: SettingsController audit read-only
└── Task 3.5: SettingsModule registrado en AppModule

Wave FINAL (Verificación — secuencial):
├── F1: Build + tsc
├── F2: Tests existentes
├── F3: Smoke test hot-reload signal
├── F4: Smoke test hot-reload threshold
├── F5: Audit log
├── F6: Backward compat
└── F7: README
```

**Critical Path**: Wave 0 → Task 1.1 → Tasks 2.* → Tasks 3.* → F1-F7
**Max Concurrent**: 4 (Wave 0 y Wave 2)

---

## TODOs

### Wave 0 — Foundation

- [ ] 0.1. **Crear 4 entities TypeORM**

  **What to do**:
  - Crear `apps/backend/src/settings/infrastructure/persistence/typeorm/entities/signal.entity.ts`:
    ```typescript
    @Entity('signals')
    export class SignalEntity {
      @PrimaryGeneratedColumn('uuid') id!: string;
      @Index({ unique: true })
      @Column({ length: 100 }) code!: string;
      @Column({ length: 200 }) name!: string;
      @Column({ type: 'int' }) penalty!: number;
      @Column({ type: 'enum', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
      riskLevel!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      @Column({ default: true }) enabled!: boolean;
      @Index()
      @Column({ type: 'enum', enum: ['token', 'kol'] })
      appliesTo!: 'token' | 'kol';
      @CreateDateColumn() createdAt!: Date;
      @UpdateDateColumn() updatedAt!: Date;
    }
    ```
  - Crear `scoring-threshold.entity.ts`:
    ```typescript
    @Entity('scoring_thresholds')
    export class ScoringThresholdEntity {
      @PrimaryGeneratedColumn('uuid') id!: string;
      @Column({ type: 'enum', enum: ['token', 'kol'] }) scope!: 'token' | 'kol';
      @Column({ type: 'int' }) minScore!: number;
      @Column({ type: 'int' }) maxScore!: number;
      @Column({ length: 32 }) decision!: string;  // 'PUBLISHED' | 'REJECTED' | 'TIER_STRONG' | etc.
    }
    ```
  - Crear `settings-filter.entity.ts`:
    ```typescript
    @Entity('settings_filters')
    export class SettingsFilterEntity {
      @PrimaryGeneratedColumn('uuid') id!: string;
      @Column({ length: 64 }) type!: string;  // 'blacklist_mint' | 'publishable_chain' | etc.
      @Column({ length: 256 }) value!: string;
      @Column({ type: 'enum', enum: ['token', 'kol', 'all'] }) scope!: 'token' | 'kol' | 'all';
      @Column({ default: true }) enabled!: boolean;
      @Column({ type: 'text', nullable: true }) notes!: string | null;
      @CreateDateColumn() createdAt!: Date;
      @UpdateDateColumn() updatedAt!: Date;
    }
    ```
  - Crear `settings-audit-log.entity.ts`:
    ```typescript
    @Entity('settings_audit_log')
    export class SettingsAuditLogEntity {
      @PrimaryGeneratedColumn('uuid') id!: string;
      @Index()
      @Column({ length: 64 }) entityType!: string;
      @Index()
      @Column({ length: 128 }) entityId!: string;
      @Column({ type: 'enum', enum: ['CREATE', 'UPDATE', 'DELETE'] }) action!: 'CREATE' | 'UPDATE' | 'DELETE';
      @Column({ type: 'jsonb', nullable: true }) before!: Record<string, unknown> | null;
      @Column({ type: 'jsonb', nullable: true }) after!: Record<string, unknown> | null;
      @Column({ type: 'inet', nullable: true }) sourceIp!: string | null;
      @CreateDateColumn() createdAt!: Date;
    }
    ```
  - Agregar a `apps/backend/src/shared/common/persistence/database.module.ts` → `PERSISTED_ENTITIES` array

  **Must NOT do**:
  - No usar prefijo `admin_*` en nombres de tabla
  - No hacer `synchronize: false` (mantener dev simple)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`
  - Reason: 4 entities nuevas siguiendo patrón existente

  **Parallelization**: Wave 0 (paralelizable con 0.2, 0.3, 0.4)

  **References**:
  - Patrón entity: `apps/backend/src/token/scoring/infrastructure/persistence/typeorm/entities/token-score.entity.ts:23-58`
  - `PERSISTED_ENTITIES` array: `apps/backend/src/shared/common/persistence/database.module.ts`

  **Acceptance Criteria**:
  - [ ] 4 entities creadas con shapes documentados
  - [ ] Registradas en `PERSISTED_ENTITIES`
  - [ ] `npx tsc --noEmit -p apps/backend/tsconfig.json` pasa
  - [ ] `synchronize: true` crea las 4 tablas al boot (verificar con `psql` o `pgadmin`)

  **Commit**: YES
  - Message: `feat(settings): add entities for dynamic settings (signals, thresholds, filters, audit)`
  - Files: `apps/backend/src/settings/infrastructure/persistence/typeorm/entities/*.ts`, `database.module.ts`

- [ ] 0.2. **Crear 6 DTOs con class-validator**

  **What to do**:
  - `apps/backend/src/settings/api/input/`
    - `create-signal.dto.ts`:
      ```typescript
      import { IsString, IsInt, IsEnum, IsBoolean, IsOptional, Length } from 'class-validator';
      export class CreateSignalDto {
        @IsString() @Length(1, 100) code!: string;
        @IsString() @Length(1, 200) name!: string;
        @IsInt() penalty!: number;
        @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) riskLevel!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        @IsEnum(['token', 'kol']) appliesTo!: 'token' | 'kol';
        @IsOptional() @IsBoolean() enabled?: boolean = true;
      }
      ```
    - `update-signal.dto.ts` (PartialType omitiendo `code` y `appliesTo` que son inmutables):
      ```typescript
      import { PartialType, OmitType } from '@nestjs/mapped-types';
      export class UpdateSignalDto extends PartialType(OmitType(CreateSignalDto, ['code', 'appliesTo'] as const)) {}
      ```
    - `create-threshold.dto.ts`:
      ```typescript
      export class CreateThresholdDto {
        @IsEnum(['token', 'kol']) scope!: 'token' | 'kol';
        @IsInt() @Min(0) @Max(100) minScore!: number;
        @IsInt() @Min(0) @Max(100) maxScore!: number;
        @IsString() @Length(1, 32) decision!: string;
      }
      ```
    - `update-threshold.dto.ts` (PartialType de Create)
    - `create-filter.dto.ts`:
      ```typescript
      export class CreateFilterDto {
        @IsString() @Length(1, 64) type!: string;
        @IsString() @Length(1, 256) value!: string;
        @IsEnum(['token', 'kol', 'all']) scope!: 'token' | 'kol' | 'all';
        @IsOptional() @IsBoolean() enabled?: boolean = true;
        @IsOptional() @IsString() notes?: string;
      }
      ```
    - `update-filter.dto.ts` (PartialType)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**: Wave 0

  **References**:
  - Patrón DTO: `apps/backend/src/token/scoring/api/input/score-token.input.ts:25-72`
  - Global ValidationPipe en `main.ts:36`

  **Acceptance Criteria**:
  - [ ] 6 DTOs con validación class-validator
  - [ ] `npx tsc` pasa

  **Commit**: NO (groups with Wave 0 final)

- [ ] 0.3. **Crear 4 mappers bidireccionales**

  **What to do**:
  - `apps/backend/src/settings/application/mappers/`:
    - `signal.mapper.ts`:
      ```typescript
      export const SignalMapper = {
        toDomain: (e: SignalEntity): SignalConfig => ({
          id: e.id, code: e.code, name: e.name, penalty: e.penalty,
          riskLevel: e.riskLevel, enabled: e.enabled, appliesTo: e.appliesTo,
        }),
        toEntity: (d: SignalConfig): SignalEntity => {
          const e = new SignalEntity();
          e.id = d.id; e.code = d.code; e.name = d.name; e.penalty = d.penalty;
          e.riskLevel = d.riskLevel; e.enabled = d.enabled; e.appliesTo = d.appliesTo;
          return e;
        },
      };
      ```
    - Mismos para threshold, filter, audit (más simples)
  - Crear types de dominio en `apps/backend/src/settings/domain/types/`:
    - `signal-config.ts`, `threshold-config.ts`, `filter-config.ts`, `audit-entry.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**: Wave 0

  **References**:
  - Patrón: `apps/backend/src/token/scoring/application/mappers/token-score.mapper.ts:23-38`

  **Acceptance Criteria**:
  - [ ] 4 mappers funcionales
  - [ ] Types de dominio definidos

  **Commit**: NO

- [ ] 0.4. **Crear SettingsModule skeleton**

  **What to do**:
  - `apps/backend/src/settings/settings.module.ts`:
    ```typescript
    @Module({
      imports: [TypeOrmModule.forFeature([SignalEntity, ScoringThresholdEntity, SettingsFilterEntity, SettingsAuditLogEntity])],
      controllers: [/* controllers en Wave 3 */],
      providers: [/* services en Wave 1 */],
      exports: [/* servicios públicos */],
    })
    export class SettingsModule {}
    ```
  - `apps/backend/src/settings/api/`, `application/`, `domain/`, `infrastructure/` directorios creados
  - **NO registrar en AppModule todavía** (eso es Task 3.5)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**: Wave 0

  **Acceptance Criteria**:
  - [ ] Módulo esqueleto compila
  - [ ] Estructura de directorios completa

  **Commit**: NO

### Wave 1 — SettingsService core

- [ ] 1.1. **SettingsService con cache in-memory**

  **What to do**:
  - `apps/backend/src/settings/application/services/settings.service.ts`:
    ```typescript
    @Injectable()
    export class SettingsService {
      private readonly cache = {
        signals: new Map<string, { value: SignalConfig[]; expiresAt: number }>(),
        thresholds: new Map<string, { value: ThresholdConfig[]; expiresAt: number }>(),
        filters: new Map<string, { value: FilterConfig[]; expiresAt: number }>(),
      };
      private readonly TTL_MS = parseInt(process.env.SETTINGS_CACHE_TTL_MS ?? '30000', 10);

      constructor(
        @InjectRepository(SignalEntity) private readonly signalRepo: Repository<SignalEntity>,
        @InjectRepository(ScoringThresholdEntity) private readonly thresholdRepo: Repository<ScoringThresholdEntity>,
        @InjectRepository(SettingsFilterEntity) private readonly filterRepo: Repository<SettingsFilterEntity>,
      ) {}

      async getSignalsForScope(appliesTo: 'token' | 'kol'): Promise<SignalConfig[]> {
        const key = `signals:${appliesTo}`;
        const cached = this.cache.signals.get(key);
        if (cached && cached.expiresAt > Date.now()) return cached.value;
        const fresh = await this.signalRepo.find({ where: { appliesTo, enabled: true } });
        const mapped = fresh.map(SignalMapper.toDomain);
        this.cache.signals.set(key, { value: mapped, expiresAt: Date.now() + this.TTL_MS });
        return mapped;
      }

      async getSignal(code: string, appliesTo: 'token' | 'kol'): Promise<SignalConfig | null> {
        const all = await this.getSignalsForScope(appliesTo);
        return all.find(s => s.code === code) ?? null;
      }

      // ... getThresholds, getFilters análogos
    }
    ```
  - Métodos adicionales para config no-cacheable (o cacheable con TTL):
    - `getTokenGateConfig()`: lee de thresholds + filters + retorna config para ApplyFiltersUseCase
    - `getKOLThresholds()`, `getKOLConfidenceBuckets()`, etc.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`
  - Reason: lógica no trivial (cache + múltiples métodos + tipos)

  **Parallelization**: Wave 1 (con 1.2, 1.3, 1.4)

  **References**:
  - Patrón: leer `apps/backend/src/shared/common/persistence/database.module.ts` para ver cómo se inyectan repos
  - Cache pattern: `apps/backend/src/token/scoring/infrastructure/repositories/in-memory-token-score.repository.ts:7-50` (Map con TTL implícito)

  **Acceptance Criteria**:
  - [ ] 12+ métodos implementados (ver Fase 2 deliverables)
  - [ ] Cache TTL configurable vía env var
  - [ ] Test: primer call pega a DB, segundo usa cache
  - [ ] `npx tsc` pasa

  **Commit**: NO (groups with Wave 1 final)

- [ ] 1.2. **Métodos de invalidación de cache**

  **What to do**:
  - En `SettingsService`:
    ```typescript
    async invalidateSignalsCache(appliesTo?: 'token' | 'kol'): Promise<void> {
      if (appliesTo) this.cache.signals.delete(`signals:${appliesTo}`);
      else this.cache.signals.clear();
    }
    async invalidateThresholdsCache(scope?: 'token' | 'kol'): Promise<void> { /* análogo */ }
    async invalidateFiltersCache(type?: string): Promise<void> { /* análogo */ }
    async invalidateAll(): Promise<void> { /* limpia los 3 */ }
    ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**: Wave 1

  **Acceptance Criteria**:
  - [ ] 4 métodos de invalidación
  - [ ] Test: invalidar → próximo call pega a DB

  **Commit**: NO

- [ ] 1.3. **AuditService (helper)**

  **What to do**:
  - `apps/backend/src/settings/application/services/audit.service.ts`:
    ```typescript
    @Injectable()
    export class AuditService {
      constructor(
        @InjectRepository(SettingsAuditLogEntity) private readonly repo: Repository<SettingsAuditLogEntity>,
      ) {}

      async log(
        entityType: 'signal' | 'threshold' | 'filter',
        entityId: string,
        action: 'CREATE' | 'UPDATE' | 'DELETE',
        before: Record<string, unknown> | null,
        after: Record<string, unknown> | null,
        sourceIp: string | null,
      ): Promise<void> {
        await this.repo.save({
          entityType, entityId, action, before, after, sourceIp,
        });
      }

      async query(filter: { entityType?: string; entityId?: string; since?: Date; limit?: number }): Promise<SettingsAuditLogEntity[]> {
        const qb = this.repo.createQueryBuilder('audit');
        if (filter.entityType) qb.andWhere('audit.entityType = :t', { t: filter.entityType });
        if (filter.entityId) qb.andWhere('audit.entityId = :i', { i: filter.entityId });
        if (filter.since) qb.andWhere('audit.createdAt >= :s', { s: filter.since });
        qb.orderBy('audit.createdAt', 'DESC').limit(filter.limit ?? 50);
        return qb.getMany();
      }
    }
    ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**: Wave 1

  **Acceptance Criteria**:
  - [ ] `log()` y `query()` implementados
  - [ ] Query soporta filtros básicos

  **Commit**: NO

- [ ] 1.4. **Tests del SettingsService (mockeando repos)**

  **What to do**:
  - `apps/backend/src/settings/application/services/settings.service.spec.ts`:
    - Test: cache miss → query a DB
    - Test: cache hit → no query
    - Test: invalidación → siguiente call pega a DB
    - Test: TTL expiry → siguiente call pega a DB (mockear Date.now)
    - Test: getSignalsForScope('token') solo retorna signals con `appliesTo: 'token'`
    - Test: getSignalsForScope filtra `enabled: true`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**: Wave 1

  **Acceptance Criteria**:
  - [ ] 6+ tests pasan
  - [ ] `npm run test:backend -- settings` pasa

  **Commit**: NO

### Wave 2 — Refactor con backward compat

> ⚠️ **CRÍTICO**: cada refactor debe mantener **backward compat**. Si el setting no existe en DB → usar constante hardcoded + log warning (no romper el flujo actual).

- [ ] 2.1. **`ScoreTokenUseCase` lee de `SettingsService`**

  **What to do**:
  - En `apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts`:
    - Inyectar `SettingsService` en el constructor
    - En `liquidityBonus/holdersBonus/marketCapBonus/volumeBonus/buzzBonus`:
      - Leer thresholds desde `await this.settings.getScoringThresholds('token', 'LIQUIDITY')` (ejemplo)
      - O más simple: `await this.settings.getSignalsForScope('token')` y buscar por `factor: 'LIQUIDITY_HIGH'` para obtener el delta
      - Si el signal no existe → usar constante hardcoded actual + log warning
    - En `signalPenalties`:
      - Usar `await this.settings.getSignal(s.type, 'token')` para obtener el penalty (mapping dinámico: si `s.severity === 'CRITICAL'` → buscar signal con `riskLevel: 'CRITICAL'`)
      - O más simple: leer los 4 signals `SIGNAL_*` con `riskLevel: CRITICAL/HIGH/MEDIUM/LOW` y mapear severity → penalty
    - En `reputationMultiplier`:
      - Leer `pivot` y `slope` de settings (default `0.5` y `0.3`)
    - En `securityFlagCap`:
      - Leer caps desde settings (default `5/30/20/100`)
    - En `BASE_SCORE` (`:65`):
      - Leer de settings (default `50`)

  **Backward compat** (obligatorio):
  - Envolver cada lectura de settings en try/catch
  - Si falla → log warning + usar constante local
  - Si el signal/threshold no existe → log warning + usar constante local

  **Must NOT do**:
  - No cambiar la fórmula final
  - No eliminar constantes hardcoded — son el fallback
  - No cambiar la signature de `execute()`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`
  - Reason: refactor crítico con muchos touchpoints y backward compat

  **Parallelization**: Wave 2 (con 2.2, 2.3, 2.4, 2.5)

  **References**:
  - Código actual: `score-token.use-case.ts:56-356`
  - Test existente: `score-token.use-case.spec.ts` — verificar que sigue pasando

  **Acceptance Criteria**:
  - [ ] `ScoreTokenUseCase` lee signals + thresholds + caps + multiplier de settings
  - [ ] Fallback a constantes funciona (test: con DB vacía → mismo score que antes)
  - [ ] Test existente `score-token.use-case.spec.ts` pasa sin cambios
  - [ ] `npx tsc` pasa

  **QA Scenarios**:
  ```
  Scenario: Cambiar penalty de SIGNAL_LOW_LIQUIDITY via API afecta el score
    Steps:
      1. PATCH /settings/signals/<id> con penalty nuevo
      2. POST /ca/scoring/score con liquidity >= 50k
      3. Verificar que el breakdown incluye el nuevo delta
    Expected: el delta refleja el nuevo penalty
  ```

  **Commit**: NO (groups with Wave 2 final)

- [ ] 2.2. **`ApplyFiltersUseCase` lee de `SettingsService`**

  **What to do**:
  - En `apps/backend/src/token/token-gating/application/handlers/apply-filters.use-case.ts`:
    - Inyectar `SettingsService`
    - Reemplazar `const config = input.config ?? DEFAULT_FILTER_CONFIG;` con:
      ```typescript
      const config = input.config ?? await this.settings.getTokenGateConfig();
      ```
    - Reemplazar `BUNDLERS_HIGH_THRESHOLD`, `INSIDERS_HIGH_THRESHOLD`, `BONDING_INCOMPLETE_THRESHOLD` con lectura de `settings.getExtraThresholds()`
    - Reemplazar `PUBLISHABLE_CHAINS` con `settings.getPublishableChains()`
    - Reemplazar honeypot heuristic (`:124`) con `settings.getHoneypotHeuristic()`

  **Backward compat**:
  - Si settings no tiene los valores → usar `DEFAULT_FILTER_CONFIG` actual + constantes
  - `input.config` (pasado por HTTP) tiene prioridad sobre settings (preservar comportamiento)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**: Wave 2

  **References**:
  - Código actual: `apply-filters.use-case.ts:1-216`
  - Test existente: `apply-filters.use-case.spec.ts` — cubre los 7 gates

  **Acceptance Criteria**:
  - [ ] `ApplyFiltersUseCase` lee config + thresholds + chains + honeypot de settings
  - [ ] Fallback a constantes funciona
  - [ ] `apply-filters.use-case.spec.ts` pasa sin cambios (debe producir mismos APPROVED/REJECTED)
  - [ ] `npx tsc` pasa

  **Commit**: NO

- [ ] 2.3. **`KolReputation` VO lee thresholds de settings**

  **What to do**:
  - En `apps/backend/src/telegram-kol/reputation/domain/value-objects/kol-reputation.vo.ts`:
    - **PROBLEMA**: el VO es puro (sin dependencias de NestJS). No puede inyectar SettingsService directamente.
    - **SOLUCIÓN**: el VO sigue siendo puro, pero los getters `isTrusted`/`isSuspicious` se cambian para aceptar thresholds como parámetro:
      ```typescript
      public isTrusted(trustedScore: number = 0.7): boolean {
        return this.props.score >= trustedScore && this.props.confidence !== 'LOW';
      }
      ```
    - El caller (`DefaultKolReputationAdapter` o quien lo use) lee los thresholds de settings y los pasa al método
  - Identificar todos los call sites de `isTrusted`/`isSuspicious`:
    - `grep -rn "isTrusted\|isSuspicious" apps/backend/src/`
    - Actualizar cada uno para leer thresholds de settings

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`
  - Reason: refactor que toca VO + múltiples call sites

  **Parallelization**: Wave 2

  **References**:
  - Código actual: `kol-reputation.vo.ts:108-112`
  - Usos: `grep -rn "isTrusted\|isSuspicious" apps/backend/src/`

  **Acceptance Criteria**:
  - [ ] `isTrusted`/`isSuspicious` aceptan threshold como parámetro
  - [ ] Todos los call sites actualizados para leer de settings
  - [ ] Backward compat: default `0.7`/`0.3`
  - [ ] Tests existentes pasan

  **Commit**: NO

- [ ] 2.4. **`DefaultKnownKolRegistry` lee de settings**

  **What to do**:
  - En `apps/backend/src/telegram-kol/reputation/infrastructure/known-kol/default-known-kol.registry.ts`:
    - Inyectar `SettingsService`
    - En `getGoodScore()`: leer `await this.settings.getKnownKOLs().good` en lugar de `KNOWN_GOOD` hardcoded
    - En `isBad()`: leer `await this.settings.getKnownKOLs().bad` en lugar de `KNOWN_BAD` hardcoded
  - Mantener `KNOWN_GOOD` y `KNOWN_BAD` como fallback si settings no tiene los valores

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**: Wave 2

  **References**:
  - Código actual: `default-known-kol.registry.ts:18-42`

  **Acceptance Criteria**:
  - [ ] Lee KNOWN_GOOD/KNOWN_BAD de settings
  - [ ] Fallback a constantes hardcoded
  - [ ] Test existente (si hay) pasa

  **Commit**: NO

- [ ] 2.5. **`recompute-kol-reputation.service.ts` lee de settings**

  **What to do**:
  - En `apps/backend/src/telegram-kol/reputation/domain/services/recompute-kol-reputation.service.ts`:
    - Inyectar `SettingsService` (o pasar formula constants como parámetro al método)
    - En score formula (`:55`): leer `base` (default `0.5`) y `slope` (default `0.5`) de settings
    - En confidence buckets (`:60-63`): leer de settings (default: 0-4 LOW, 5-19 MEDIUM, 20-49 HIGH, 50+ VERY_HIGH)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`
  - Reason: el service es domain pero necesita acceso a config (hexagonal: pasar como param o port)

  **Parallelization**: Wave 2

  **References**:
  - Código actual: `recompute-kol-reputation.service.ts:55-63`

  **Acceptance Criteria**:
  - [ ] Formula y confidence buckets configurables
  - [ ] Backward compat con defaults actuales
  - [ ] Tests existentes pasan

  **Commit**: NO

### Wave 3 — REST endpoints

- [ ] 3.1. **`SettingsController` — signals CRUD**

  **What to do**:
  - `apps/backend/src/settings/api/http/signals.controller.ts`:
    ```typescript
    @Controller('settings/signals')
    export class SignalsController {
      constructor(
        private readonly settings: SettingsService,
        private readonly audit: AuditService,
        @InjectRepository(SignalEntity) private readonly repo: Repository<SignalEntity>,
        @Inject(REQUEST) private readonly request: Request,
      ) {}

      @Get()
      async list(@Query('appliesTo') appliesTo?: 'token' | 'kol') {
        const where = appliesTo ? { appliesTo } : {};
        return this.repo.find({ where, order: { code: 'ASC' } });
      }

      @Post()
      async create(@Body() dto: CreateSignalDto) {
        const entity = this.repo.create(dto);
        const saved = await this.repo.save(entity);
        await this.settings.invalidateSignalsCache(dto.appliesTo);
        await this.audit.log('signal', saved.id, 'CREATE', null, saved, this.request.ip ?? null);
        return saved;
      }

      @Patch(':id')
      async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSignalDto) {
        const before = await this.repo.findOneByOrFail({ id });
        Object.assign(before, dto);
        const after = await this.repo.save(before);
        await this.settings.invalidateSignalsCache(before.appliesTo);
        await this.audit.log('signal', id, 'UPDATE', before, after, this.request.ip ?? null);
        return after;
      }

      @Delete(':id')
      async remove(@Param('id', ParseUUIDPipe) id: string) {
        const before = await this.repo.findOneByOrFail({ id });
        await this.repo.delete(id);
        await this.settings.invalidateSignalsCache(before.appliesTo);
        await this.audit.log('signal', id, 'DELETE', before, null, this.request.ip ?? null);
        return { deleted: true };
      }
    }
    ```

  **Must NOT do**:
  - **NO** `@UseGuards(...)` — sin auth
  - **NO** prefijo `/admin/`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**: Wave 3 (con 3.2, 3.3, 3.4)

  **References**:
  - Patrón controller: `apps/backend/src/token/scoring/api/http/scoring.controller.ts:9-62`

  **Acceptance Criteria**:
  - [ ] 4 endpoints funcionan
  - [ ] Cache se invalida en POST/PATCH/DELETE
  - [ ] Audit log se crea en cada mutación
  - [ ] Sin guard

  **Commit**: NO

- [ ] 3.2. **`SettingsController` — thresholds CRUD**

  **What to do**:
  - Mismo patrón que 3.1, controller: `apps/backend/src/settings/api/http/thresholds.controller.ts`
  - Path: `/settings/thresholds`
  - Invalidar cache de thresholds

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**: Wave 3

  **Acceptance Criteria**:
  - [ ] 4 endpoints funcionando

  **Commit**: NO

- [ ] 3.3. **`SettingsController` — filters CRUD**

  **What to do**:
  - Mismo patrón, controller: `apps/backend/src/settings/api/http/filters.controller.ts`
  - Path: `/settings/filters`
  - Invalidar cache de filters

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**: Wave 3

  **Acceptance Criteria**:
  - [ ] 4 endpoints funcionando

  **Commit**: NO

- [ ] 3.4. **`SettingsController` — audit read-only**

  **What to do**:
  - `apps/backend/src/settings/api/http/audit.controller.ts`:
    ```typescript
    @Controller('settings/audit')
    export class AuditController {
      constructor(private readonly audit: AuditService) {}

      @Get()
      async list(
        @Query('entityType') entityType?: string,
        @Query('entityId') entityId?: string,
        @Query('since') since?: string,
        @Query('limit') limit?: string,
      ) {
        return this.audit.query({
          entityType,
          entityId,
          since: since ? new Date(since) : undefined,
          limit: limit ? parseInt(limit, 10) : 50,
        });
      }
    }
    ```
  - Solo GET (read-only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**: Wave 3

  **Acceptance Criteria**:
  - [ ] GET con query params funcionales
  - [ ] Sin POST/PATCH/DELETE

  **Commit**: NO

- [ ] 3.5. **Registrar `SettingsModule` en `AppModule`**

  **What to do**:
  - En `apps/backend/src/app.module.ts`:
    - Importar `SettingsModule`
    - Agregar a `imports`
  - Verificar que el orden de imports no rompe nada

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Acceptance Criteria**:
  - [ ] `SettingsModule` registrado
  - [ ] Backend arranca sin errores
  - [ ] Endpoints `/settings/*` responden

  **Commit**: YES (separado para rollback fácil)
  - Message: `feat(settings): register SettingsModule and add /settings/* endpoints`

---

## Final Verification Wave (MANDATORY)

- [ ] F1. **Build & TypeScript Check**
  Run `npm run build` desde monorepo root. Output: `Build [PASS/FAIL]`

- [ ] F2. **Backend Tests**
  Run `npm run test:backend`. Los 306 tests existentes + los nuevos del SettingsService deben pasar. Output: `Tests [N pass / N fail]`

- [ ] F3. **Smoke Test — Hot Reload de Signal**
  1. Iniciar backend
  2. `curl -X POST http://localhost:3030/settings/signals -H "Content-Type: application/json" -d '{"code":"SIGNAL_TEST","name":"Test","penalty":-99,"riskLevel":"HIGH","appliesTo":"token"}'`
  3. Esperar 30s (TTL del cache) o `curl -X DELETE /settings/cache` (si lo exponemos) o esperar
  4. `curl -X POST http://localhost:3030/ca/scoring/score -H "Content-Type: application/json" -d '{...token con signals de tipo "TEST"...}'`
  5. Verificar que el breakdown incluye `SIGNAL_TEST: -99`
  Output: `Hot reload signal [PASS/FAIL]`

- [ ] F4. **Smoke Test — Hot Reload de Threshold**
  1. `curl -X PATCH http://localhost:3030/settings/thresholds/<id> -d '{"minScore": 10}'`
  2. `curl -X POST http://localhost:3030/ca/filters/apply -d '{...token con score=5...}'`
  3. Verificar que ahora se rechaza con `SCORE_TOO_LOW: "Score 5 < 10 threshold"` (en lugar de 50)
  Output: `Hot reload threshold [PASS/FAIL]`

- [ ] F5. **Audit Log Verification**
  1. Hacer POST, PATCH, DELETE en `/settings/signals`
  2. `curl http://localhost:3030/settings/audit?entityType=signal`
  3. Verificar 3 entries con `before`, `after`, `sourceIp` correctos
  Output: `Audit log [PASS/FAIL]`

- [ ] F6. **Backward Compat**
  1. Borrar TODA la DB, hacer `npm run docker:up` (levantar Postgres limpio)
  2. Arrancar backend con `DATABASE_SYNCHRONIZE=true`
  3. `synchronize` crea las 4 tablas vacías
  4. `curl -X POST http://localhost:3030/ca/scoring/score -d '{...token de prueba...}'` → debe funcionar
  5. `curl -X POST http://localhost:3030/ca/filters/apply -d '{...token de prueba...}'` → debe funcionar
  6. Verificar que APPROVED/REJECTED coinciden con la lógica previa (con DB vacía, settings devuelve fallback a constantes)
  Output: `Backward compat [PASS/FAIL]`

- [ ] F7. **README actualizado**
  - Agregar sección "Dynamic Settings" a `apps/backend/README.md`
  - Documentar endpoints `/settings/*`
  - Documentar shape esperado de signals/thresholds/filters
  - Documentar que NO hay auth (Tailscale)
  - Agregar warning: "NO exponer públicamente sin agregar auth"
  Output: `README updated [YES/NO]`

---

## Commit Strategy

- **Wave 0** (foundation): 1 commit — `feat(settings): add entities and DTOs for dynamic settings`
- **Wave 1** (service core): 1 commit — `feat(settings): add SettingsService with cache and audit`
- **Wave 2** (consumer refactor): 1 commit — `refactor(scoring): read signals/thresholds from SettingsService with backward compat`
- **Wave 3** (endpoints): 1 commit — `feat(settings): register SettingsModule and add /settings/* endpoints`
- **Wave final** (README): 1 commit — `docs: document /settings/* endpoints and Tailscale requirement`

---

## Success Criteria

### Verification Commands
```bash
# Build
npm run build

# Tests
npm run test:backend

# Smoke tests
curl -X POST http://localhost:3030/settings/signals \
  -H "Content-Type: application/json" \
  -d '{"code":"SIGNAL_TEST","name":"Test","penalty":-99,"riskLevel":"HIGH","appliesTo":"token"}'

curl -X POST http://localhost:3030/ca/scoring/score -d '{...}'
curl http://localhost:3030/settings/audit?entityType=signal
```

### Final Checklist
- [ ] Reporte de hallazgos escrito y validado
- [ ] 4 entities creadas y registradas
- [ ] 6 DTOs con class-validator
- [ ] SettingsService con 12+ métodos + cache + invalidation
- [ ] AuditService con log + query
- [ ] ScoreTokenUseCase refactor con backward compat
- [ ] ApplyFiltersUseCase refactor con backward compat
- [ ] KolReputation refactor con backward compat
- [ ] DefaultKnownKolRegistry refactor con backward compat
- [ ] recompute-kol-reputation refactor con backward compat
- [ ] 13 endpoints REST en `/settings/*` (4+4+4+1)
- [ ] SettingsModule registrado en AppModule
- [ ] Build pasa
- [ ] 306 tests existentes pasan
- [ ] Nuevos tests del SettingsService pasan
- [ ] F3 hot-reload signal funciona
- [ ] F4 hot-reload threshold funciona
- [ ] F5 audit log funciona
- [ ] F6 backward compat con DB vacía funciona
- [ ] F7 README documentado
