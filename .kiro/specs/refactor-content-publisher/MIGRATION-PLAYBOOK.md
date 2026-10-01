# Content Publisher Migration Playbook

> **Audiencia**: DevOps, Product Owners, Stakeholders no técnicos  
> **Propósito**: Guía ejecutiva de migración sin detalles de implementación  
> **Tiempo de lectura**: 10 minutos

---

## 🎯 Executive Summary

**Qué**: Extraer sistema de publicación de crypto-news del backend monolito → app independiente (`apps/content-publisher/`)

**Por qué**:

- Backend monolito tiene 22 módulos (sobrecargado)
- Crypto-news genera 80% del tráfico de publicación
- Imposible escalar publicación sin escalar todo el backend
- Preparar arquitectura para threads (v2) sin contaminar backend

**Cuándo**: 7 semanas (8 fases)

**Riesgo**: Medio (rollback total en 30 min si falla)

**Costo de NO hacerlo**:

- Latencia de publicación aumenta (actual: 1-2 min, futuro: 5+ min)
- Imposible agregar nuevos content types sin refactor mayor
- Debugging difícil (logs mezclados con 22 módulos)

---

## 📅 Timeline (7 Semanas)

```
Week 1      Week 2      Week 3      Week 4      Week 5      Week 6      Week 7
├─────┬─────┼─────┬─────┼─────┬─────┼─────┬─────┼─────┬─────┼─────┬─────┼─────┤
│ P1  │ P2  │ P3  │ P4  │ P5  │ P6  │ P7  │ P7  │ P8  │Test │Stag.│Stag.│Prod.│
│Setup│Share│Queue│Inges│Match│ LLM │Dedup│Sched│Teleg│ E2E │ Val │ Val │Cutov│
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
                                                                        ▲
                                                                        └─ Go/No-Go Decision
```

**Hitos clave**:

- **Semana 3**: Infra lista (DB + Queue + Ingestion)
- **Semana 5**: Lógica de negocio completa (Matching + LLM + Dedup + Scheduling)
- **Semana 6**: E2E tests green + staging validation
- **Semana 7**: Production cutover (rollout gradual con feature flag)

---

## 🚦 Go/No-Go Criteria (Pre-Production)

Antes de activar `USE_CONTENT_PUBLISHER=true` en producción, validar:

| #   | Criterio                                      | Validación                                                          | Responsable | Status |
| --- | --------------------------------------------- | ------------------------------------------------------------------- | ----------- | ------ |
| 1   | E2E tests green (100%)                        | `npm run test:e2e` en content-publisher                             | QA          | ☐      |
| 2   | Staging publica sin errores (7 días)          | 0 errores en logs `/var/log/content-publisher-staging.log`          | DevOps      | ☐      |
| 3   | Dual-write consistency (backend vs new app)   | Comparar queue counts (deben ser iguales ±5%)                       | Dev         | ☐      |
| 4   | Rollback tested en staging                    | Ejecutar rollback completo, backend vuelve a publicar correctamente | DevOps      | ☐      |
| 5   | Puertos disponibles (3042 prod, 3041 staging) | `lsof -i :3041` y `:3042` → vacío                                   | DevOps      | ☐      |
| 6   | DB migrations up+down sin errores             | `npm run migration:run && npm run migration:revert`                 | Dev         | ☐      |
| 7   | LLM gateway responde <2s (p95)                | `curl -w "%{time_total}" http://llm-gateway/health`                 | DevOps      | ☐      |
| 8   | Telegram Bot API tokens válidos               | Test manual: `POST /api/telegram/test-message`                      | Product     | ☐      |
| 9   | Frontend migrado (4 endpoints)                | `npm run build` sin errores, `API_URL` correcto en `.env.prod`      | Frontend    | ☐      |
| 10  | Monitoring dashboards creados                 | Grafana: `content-publisher-*` dashboards con 8 panels              | DevOps      | ☐      |

**Decisión**: Si TODOS ☑, proceder. Si 1+ ☐, posponer 1 semana.

---

## 📊 What Changes for Each Team

### **Para DevOps**

**Antes** (sistema actual):

- 1 app backend (`:3030`)
- 1 DB postgres (`alpha_meta_token_scanner_{env}`)
- 1 Redis (`:6379`)
- Logs: `backend.log` (mezclados con 22 módulos)

**Después** (post-refactor):

- 2 apps: backend (`:3030`) + content-publisher (`:3040/3041/3042`)
- 2 DBs: backend + `content_publisher_{env}` (mismo servidor postgres)
- 2 Redis: backend + content-publisher (mismo servidor, DB index 1)
- Logs: `backend.log` + `content-publisher.log` (separados)

**Nuevas responsabilidades**:

- Deploy content-publisher (mismo CI/CD, nuevo workflow `.github/workflows/deploy-content-publisher.yml`)
- Monitoring: 8 nuevos dashboards (queue depth, publish rate, LLM latency, dedup hits, etc.)
- Backup: nueva DB (`content_publisher_prod`, script ya existe: `scripts/backup-db.sh`)

**Docker Compose nuevo**:

```yaml
# apps/content-publisher/docker-compose.prod.yml
services:
  content-publisher:
    image: ghcr.io/org/content-publisher:latest
    ports:
      - '3042:3042'
    env_file: .env.production
    depends_on:
      - postgres
      - redis
```

**Healthcheck nuevo**:

```bash
curl -f http://localhost:3042/api/health || exit 1
```

---

### **Para Frontend Team**

**Antes** (llamadas al backend `:3030`):

```typescript
// src/shared/api/crypto-news.ts
const API_URL = 'http://localhost:3030';

export const getCryptoNewsMessages = () =>
  fetch(`${API_URL}/api/crypto-news/messages`);
```

**Después** (llamadas a content-publisher `:3040/3041/3042`):

```typescript
// src/shared/api/content-publisher.ts
const CONTENT_PUBLISHER_URL = import.meta.env.VITE_CONTENT_PUBLISHER_URL; // ← NEW ENV VAR

export const getPublishedContent = () =>
  fetch(`${CONTENT_PUBLISHER_URL}/api/content/published`);
```

**Breaking changes (4 endpoints)**:

| Old Endpoint (backend)                   | New Endpoint (content-publisher) | Breaking Change? |
| ---------------------------------------- | -------------------------------- | ---------------- |
| `GET /api/crypto-news/matching/config`   | `GET /api/matching/config`       | ✅ Path changed  |
| `PATCH /api/crypto-news/matching/config` | `PATCH /api/matching/config`     | ✅ Path changed  |
| `GET /api/crypto-news/llm/config`        | `GET /api/llm/config`            | ✅ Path changed  |
| `PATCH /api/crypto-news/llm/config`      | `PATCH /api/llm/config`          | ✅ Path changed  |

**Response schema changes**: NINGUNO (misma estructura JSON)

**Migration strategy**:

1. Semana 5: Agregar `.env.development` con `VITE_CONTENT_PUBLISHER_URL=http://localhost:3040`
2. Semana 5: Crear nuevos API clients (`src/shared/api/content-publisher.ts`)
3. Semana 5: Update components para usar nuevos clients
4. Semana 6: Deploy staging con nueva config
5. Semana 7: Deploy prod (mismo día que backend cutover)

---

### **Para Product/QA**

**Funcionalidad que NO cambia**:

- Matching (keywords, blacklist, filters) → mismo comportamiento
- LLM generation → mismos templates
- Publishing rate → misma frecuencia (1 min)
- Ads rotation → misma lógica
- Deduplication → misma cascade (exact → fuzzy → semantic)

**Funcionalidad que MEJORA**:

- ✅ Logs más claros (sin ruido de otros 21 módulos)
- ✅ Latencia menor (app dedicado, no compite por CPU con backend)
- ✅ Rollback más rápido (30 min vs 2h antes)
- ✅ Preparado para threads (v2, sin tocar backend)

**Testing necesario**:

- Regression suite completo en staging (semana 6)
- Smoke tests en prod después de cutover (primeras 4 horas)
- Performance comparison (antes/después):
  - Tiempo de publicación (meta: <2 min)
  - CPU usage backend (meta: -30%)
  - Memory usage content-publisher (meta: <512 MB)

**Smoke tests (post-cutover)**:

```bash
# 1. Verify content-publisher health
curl http://localhost:3042/api/health
# Expect: {"status":"ok","uptime":123}

# 2. Verify matching config
curl http://localhost:3042/api/matching/config
# Expect: {"enabled":true}

# 3. Verify queue stats
curl http://localhost:3042/api/queue/stats
# Expect: {"crypto-news":{"pending":5,"processing":1,"completed":42}}

# 4. Verify last published
curl http://localhost:3042/api/content/published?limit=5
# Expect: array with 5 items, each has {id, contentType, publishedAt}
```

---

### **Para Backend Team**

**Módulos eliminados** (84 archivos):

- `apps/backend/src/crypto-news-integration/` (41 archivos)
- `apps/backend/src/crypto-news-publisher/` (28 archivos)
- `apps/backend/src/crypto-news-ads/` (15 archivos)

**AppModule antes**:

```typescript
@Module({
  imports: [
    // 22 modules including:
    CryptoNewsIntegrationModule,
    CryptoNewsPublisherModule,
    CryptoNewsAdsModule,
    // ...
  ]
})
```

**AppModule después**:

```typescript
@Module({
  imports: [
    // 19 modules (3 less)
    // ❌ CryptoNewsIntegrationModule REMOVED
    // ❌ CryptoNewsPublisherModule REMOVED
    // ❌ CryptoNewsAdsModule REMOVED
    // ...
  ]
})
```

**LOC reduction**: ~15,000 líneas eliminadas (~18% del backend)

**Deprecation timeline**:

- Semana 3-5: Agregar `@deprecated` decorators (41 clases)
- Semana 6: Feature flag cutover (`USE_CONTENT_PUBLISHER=true`)
- Semana 7: Staging/prod validation
- Semana 8+: Hard deprecation (throws errors si se usa)
- Semana 10: Deletion permanente (PR con `BREAKING CHANGE`)

---

## 🔄 Rollback Procedure (30 Minutes)

Si contenido NO se publica correctamente después de activar `USE_CONTENT_PUBLISHER=true`:

### **Step 1: Disable Feature Flag** (2 min)

```bash
# SSH to production server
ssh OracleDroplet

# Edit backend .env
vim /opt/onchain-bot/apps/backend/.env.production
# Change: USE_CONTENT_PUBLISHER=false

# Restart backend
docker compose -f /opt/onchain-bot/apps/backend/docker-compose.prod.yml restart backend
```

### **Step 2: Verify Backend Publishing** (5 min)

```bash
# Monitor logs
docker logs -f onchain-bot-backend-1 | grep "Published message"

# Should see:
# [PublisherCronScheduler] Published message 12345 to Telegram
```

### **Step 3: Stop Content-Publisher** (2 min)

```bash
docker compose -f /opt/onchain-bot/apps/content-publisher/docker-compose.prod.yml stop
```

### **Step 4: Clear Queue** (3 min)

```bash
# Connect to content-publisher DB
docker exec -it content-publisher-postgres psql -U postgres -d content_publisher_prod

# Clear pending entries (prevent confusion)
DELETE FROM publisher_queue_entries WHERE state = 'pending';
```

### **Step 5: Notify Stakeholders** (1 min)

```bash
# Slack notification
curl -X POST https://hooks.slack.com/services/YOUR_WEBHOOK \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "⚠️ Content-publisher rollback completed. Backend is now publishing."
  }'
```

### **Step 6: Monitor Backend (Next 2 Hours)**

- Watch logs: `tail -f /var/log/backend.log | grep crypto-news`
- Check Telegram channel: new messages should appear every 1-2 min
- Grafana: `backend_published_count` metric should increase

### **Step 7: Post-Mortem** (Next Day)

- Review logs: `grep ERROR /var/log/content-publisher.log`
- Identify root cause (common: DB connection, LLM gateway timeout, Telegram token)
- Fix + retest en staging antes de reintentar prod

**Success Criteria**: Backend publishes 10+ messages sin errores en 30 min post-rollback

---

## 📈 Success Metrics (Post-Cutover)

Medir durante las primeras 2 semanas después de activar `USE_CONTENT_PUBLISHER=true`:

| Metric                        | Baseline (Before) | Target (After) | Actual | Status |
| ----------------------------- | ----------------- | -------------- | ------ | ------ |
| **Publishing Latency (p95)**  | 120s              | <90s           | —      | ☐      |
| **Backend CPU Usage (avg)**   | 65%               | <50%           | —      | ☐      |
| **Backend Memory (avg)**      | 2.1 GB            | <1.8 GB        | —      | ☐      |
| **Content-Publisher Memory**  | —                 | <512 MB        | —      | ☐      |
| **Published Messages/Day**    | ~850              | ~850 (same)    | —      | ☐      |
| **Failed Publishes Rate**     | 2.3%              | <2% (better)   | —      | ☐      |
| **Dedup Hits Rate**           | 8.1%              | ~8% (same)     | —      | ☐      |
| **LLM Generation Time (p95)** | 4.2s              | <3s            | —      | ☐      |
| **Incident Count (week 1)**   | —                 | 0              | —      | ☐      |
| **Rollback Count**            | —                 | 0              | —      | ☐      |

**Red flags** (trigger rollback):

- Publishing latency >180s (p95) durante >1 hora
- Failed publishes >5% durante >30 min
- Memory OOM en content-publisher
- Telegram rate limit errors (429) >10/hora

---

## 💰 Cost Impact

### **Infrastructure Costs**

| Resource                       | Before  | After   | Delta     |
| ------------------------------ | ------- | ------- | --------- |
| **Compute** (Oracle VM)        | 1 VM    | 1 VM    | $0/mo     |
| **Database** (postgres)        | 1 DB    | 2 DBs   | $0/mo     |
| **Redis**                      | 1 inst  | 1 inst  | $0/mo     |
| **Storage** (logs)             | 50 GB   | 55 GB   | +$0.50/mo |
| **LLM Gateway API Calls**      | ~15k/mo | ~15k/mo | $0/mo     |
| **CI/CD** (GitHub Actions min) | 120 min | 140 min | +$2/mo    |

**Total additional cost**: ~$2.50/mes (negligible)

### **Developer Time**

| Phase                    | Hours   | Cost (@ $80/hr) |
| ------------------------ | ------- | --------------- |
| Implementation (7 weeks) | 280     | $22,400         |
| Testing (E2E + staging)  | 40      | $3,200          |
| Rollout + monitoring     | 20      | $1,600          |
| Documentation            | 16      | $1,280          |
| **Total**                | **356** | **$28,480**     |

**Payback period**: 6 meses (asumiendo 1 bug crítico/mes evitado por mejor debugging)

---

## 🛡️ Risk Mitigation

| Risk                               | Probability | Impact | Mitigation                                                           |
| ---------------------------------- | ----------- | ------ | -------------------------------------------------------------------- |
| **Rollback needed en prod**        | Medium      | High   | Feature flag + rollback tested en staging                            |
| **Data loss durante migración**    | Low         | High   | Dual-write period (backend + content-publisher en paralelo 1 semana) |
| **LLM gateway timeout**            | Medium      | Medium | Retry 3× + fallback a raw content si falla                           |
| **Telegram rate limit (429)**      | Low         | Medium | Rate limiter (30 msg/s) + queue throttling                           |
| **DB migration rollback falla**    | Low         | High   | Test migrations up+down en staging ANTES de prod                     |
| **Frontend breaking changes**      | Medium      | Low    | Deploy frontend DESPUÉS de backend cutover (mismo día, 2h después)   |
| **Monitoring gaps (no alertas)**   | High        | Medium | Create dashboards ANTES de cutover (semana 6)                        |
| **Staff vacation durante rollout** | Low         | Medium | Schedule cutover: evitar viernes, feriados, Q4 (holidays)            |

**Contingency plan**: Si 2+ risks materializan, posponer cutover 1 semana.

---

## 📞 Contact & Escalation

### **On-Call Rotation (During Cutover Week)**

| Day       | Primary         | Secondary       | Escalation |
| --------- | --------------- | --------------- | ---------- |
| Monday    | Dev Lead        | DevOps Engineer | CTO        |
| Tuesday   | Backend Dev 1   | DevOps Engineer | CTO        |
| Wednesday | Backend Dev 2   | DevOps Engineer | CTO        |
| Thursday  | QA Lead         | DevOps Engineer | CTO        |
| Friday    | Dev Lead        | DevOps Engineer | CTO        |
| Weekend   | DevOps Engineer | Dev Lead        | CTO        |

### **Escalation Matrix**

| Severity | SLA     | Action                                                               |
| -------- | ------- | -------------------------------------------------------------------- |
| P0       | 15 min  | Content NO se publica (>30 min sin mensajes) → rollback inmediato    |
| P1       | 1 hour  | Latencia >180s (p95) sostenida >1h → investigar, considerar rollback |
| P2       | 4 hours | Errores no críticos (logs warnings) → fix en siguiente deploy        |
| P3       | 1 day   | Mejoras (performance, UX) → backlog                                  |

### **Communication Channels**

- **Slack**: `#content-publisher-migration` (daily updates durante semana 7)
- **Email**: `dev-team@company.com` (milestone notifications)
- **Status Page**: `status.company.com` (user-facing, solo si P0)

---

## 📝 Sign-Off Checklist (Pre-Cutover)

Firmar ANTES de activar `USE_CONTENT_PUBLISHER=true` en producción:

- [ ] **Dev Lead**: Code review completo (8 PRs, 1 por fase)
- [ ] **QA Lead**: Regression tests green (staging, 7 días sin errores)
- [ ] **DevOps Lead**: Rollback tested, monitoring dashboards live
- [ ] **Product Owner**: Acepta que funcionalidad NO cambia (same UX)
- [ ] **CTO**: Aprueba gasto ($28k) y timeline (7 semanas)

**Firmas**:

- Dev Lead: ******\_\_\_\_****** Date: **\_\_\_\_**
- QA Lead: ********\_******** Date: **\_\_\_\_**
- DevOps Lead: ******\_****** Date: **\_\_\_\_**
- Product Owner: ****\_\_\_**** Date: **\_\_\_\_**
- CTO: **********\_********** Date: **\_\_\_\_**

---

## 🎓 Training Materials

Disponibles antes de semana 7:

1. **Video Walkthrough** (15 min): Architecture overview + new endpoints
   - Location: `docs/videos/content-publisher-walkthrough.mp4`
   - Audiencia: All engineering

2. **DevOps Runbook** (PDF): Deploy, rollback, troubleshooting
   - Location: `docs/runbooks/content-publisher-devops.pdf`
   - Audiencia: DevOps team

3. **API Migration Guide** (Markdown): Frontend breaking changes + examples
   - Location: `docs/migrations/crypto-news-to-content-publisher.md`
   - Audiencia: Frontend team

4. **Slack AMA** (live session, 1 hora): Q&A with dev lead
   - Cuando: Viernes semana 6, 3pm
   - Canal: `#content-publisher-migration`

---

## 🔗 Quick Links

- **Implementation Guide**: `.kiro/specs/refactor-content-publisher/IMPLEMENTATION-GUIDE.md`
- **Full Refactor Doc**: `.kiro/specs/refactor-content-publisher/11-refactor.md`
- **Current System Docs**: `.kiro/specs/refactor-content-publisher/01-overview.md` → `10-content-filters.md`
- **GitHub Project**: [Content-Publisher Refactor Board](https://github.com/org/onchain-bot/projects/5)
- **Slack Channel**: `#content-publisher-migration`
- **Monitoring Dashboards**: `http://grafana.company.com/d/content-publisher`

---

**Document Version**: 1.0  
**Last Updated**: 2026-09-23  
**Next Review**: After Phase 4 completion (end of week 4)
