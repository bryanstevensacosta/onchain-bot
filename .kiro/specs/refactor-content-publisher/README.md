# Content Publisher Refactor - Documentation Hub

> **Propósito**: Índice central de toda la documentación del refactor  
> **Estado**: ✅ Completo (13 documentos)  
> **Fecha**: 2026-09-23

---

## 📚 Navigation Guide

### **Para Implementadores (Developers)**

Lee estos documentos en orden:

1. **[IMPLEMENTATION-GUIDE.md](./IMPLEMENTATION-GUIDE.md)** ⭐ **START HERE**
   - Guía ejecutiva de 8 fases (7 semanas)
   - Orden de implementación por BC
   - Tabla completa de renombres (41 clases)
   - Estrategia de deprecación (5 fases)
   - Testing strategy (unit → integration → E2E → load)
   - **Duración lectura**: 20 minutos

2. **[PHASE-TRACKER.md](./PHASE-TRACKER.md)** ⭐ **DAILY USE**
   - Checklist interactivo (130 tareas)
   - Tracking por fase con assignees + blockers
   - Daily standup template
   - **Usar**: Marcar ✅ al completar cada tarea

3. **[11-refactor.md](./11-refactor.md)** 📖 **REFERENCE**
   - Plan completo de refactor (2172 líneas)
   - Arquitectura detallada (11 módulos)
   - Database schema (16 tablas v1, 18 tablas v2)
   - Rollback procedure (7 pasos, 30 min)
   - **Consultar**: Cuando necesites detalles técnicos profundos

4. **Sistema Actual** (opcional, para contexto):
   - [01-overview.md](./01-overview.md) → [10-content-filters.md](./10-content-filters.md)
   - **Duración lectura**: 1 hora (si nunca trabajaste en crypto-news)

---

### **Para DevOps / Stakeholders No Técnicos**

Lee solo este documento:

1. **[MIGRATION-PLAYBOOK.md](./MIGRATION-PLAYBOOK.md)** ⭐ **START HERE**
   - Executive summary (qué, por qué, cuándo, riesgo)
   - Timeline 7 semanas (diagrama visual)
   - Go/No-Go criteria (10 checkboxes)
   - Impacto por equipo (DevOps, Frontend, Backend, QA)
   - Rollback procedure (30 min, 7 pasos)
   - Success metrics + cost impact
   - Risk mitigation + escalation matrix
   - **Duración lectura**: 15 minutos

---

### **Para QA / Product Owners**

Lee estos documentos:

1. **[MIGRATION-PLAYBOOK.md](./MIGRATION-PLAYBOOK.md)** (sección "Para Product/QA")
   - Funcionalidad que NO cambia vs MEJORA
   - Testing necesario (regression + smoke tests)
   - Success metrics (10 métricas con targets)

2. **[PHASE-TRACKER.md](./PHASE-TRACKER.md)** (sección "E2E Testing")
   - 6 tests E2E críticos
   - Validation criteria por test

---

## 📁 Complete File Listing

| File                                                     | Lines | Purpose                           | Audience               |
| -------------------------------------------------------- | ----- | --------------------------------- | ---------------------- |
| **[IMPLEMENTATION-GUIDE.md](./IMPLEMENTATION-GUIDE.md)** | ~800  | Guía ejecutiva de implementación  | Developers             |
| **[MIGRATION-PLAYBOOK.md](./MIGRATION-PLAYBOOK.md)**     | ~600  | Plan operacional de migración     | DevOps, Stakeholders   |
| **[PHASE-TRACKER.md](./PHASE-TRACKER.md)**               | ~500  | Checklist interactivo de progreso | Developers (daily use) |
| **[11-refactor.md](./11-refactor.md)**                   | 2172  | Plan técnico completo             | Developers (reference) |
| [01-overview.md](./01-overview.md)                       | ~400  | Overview sistema actual           | Context (optional)     |
| [02-matching.md](./02-matching.md)                       | ~350  | Matching module actual            | Context (optional)     |
| [03-queue.md](./03-queue.md)                             | ~300  | Queue module actual               | Context (optional)     |
| [04-llm.md](./04-llm.md)                                 | ~380  | LLM module actual                 | Context (optional)     |
| [05-publishing.md](./05-publishing.md)                   | ~420  | Publishing flow actual            | Context (optional)     |
| [06-ads.md](./06-ads.md)                                 | ~280  | Ads rotation actual               | Context (optional)     |
| [07-deduplication.md](./07-deduplication.md)             | ~320  | Dedup strategy actual             | Context (optional)     |
| [08-apis.md](./08-apis.md)                               | ~450  | HTTP endpoints actual             | Context (optional)     |
| [09-database.md](./09-database.md)                       | ~380  | Database schema actual            | Context (optional)     |
| [10-content-filters.md](./10-content-filters.md)         | ~340  | Content filters actual            | Context (optional)     |

**Total**: 13 archivos, ~7692 líneas de documentación

---

## 🎯 Quick Links by Role

### Developer (Starting Implementation)

```bash
# 1. Read implementation guide
open .kiro/specs/refactor-content-publisher/IMPLEMENTATION-GUIDE.md

# 2. Open phase tracker for daily use
open .kiro/specs/refactor-content-publisher/PHASE-TRACKER.md

# 3. Create branch
git checkout -b feat/content-publisher-phase-1

# 4. Start Phase 1
mkdir -p apps/content-publisher/src/{shared,ingestion,matching,keywords,filters,queue,deduplication,llm,scheduling,telegram,threads}
```

### DevOps (Preparing for Cutover)

```bash
# 1. Read migration playbook
open .kiro/specs/refactor-content-publisher/MIGRATION-PLAYBOOK.md

# 2. Validate ports available
lsof -i :3040 # dev
lsof -i :3041 # staging
lsof -i :3042 # prod

# 3. Create monitoring dashboards (Grafana)
# - Queue depth
# - Publish rate
# - LLM latency
# - Dedup hits
# - Failed rate
# - CPU/Memory usage

# 4. Test rollback procedure in staging (dry-run)
```

### QA (Preparing Test Suite)

```bash
# 1. Read migration playbook (section "Para Product/QA")
open .kiro/specs/refactor-content-publisher/MIGRATION-PLAYBOOK.md

# 2. Review E2E tests checklist
open .kiro/specs/refactor-content-publisher/PHASE-TRACKER.md
# Scroll to "E2E Testing (Week 7, Days 3-5)"

# 3. Prepare regression test plan
# - Matching (keywords, blacklist, filters)
# - LLM generation
# - Publishing rate
# - Ads rotation
# - Deduplication
```

### Product Owner (Approval Decision)

```bash
# 1. Read executive summary
open .kiro/specs/refactor-content-publisher/MIGRATION-PLAYBOOK.md
# Read first 3 sections: Executive Summary, Timeline, Go/No-Go Criteria

# 2. Review cost impact
# Section: Cost Impact ($28k one-time, $2.50/mo ongoing)

# 3. Review success metrics
# Section: Success Metrics (10 metrics with targets)

# 4. Sign-off checklist
# Section: Sign-Off Checklist (Pre-Cutover)
```

---

## 🛠️ Supporting Scripts

| Script                         | Location                                | Purpose                                     |
| ------------------------------ | --------------------------------------- | ------------------------------------------- |
| **add-deprecation-headers.js** | `scripts/add-deprecation-headers.js`    | Agregar @deprecated headers automáticamente |
| backup-db.sh                   | `scripts/backup-db.sh`                  | Backup de DB antes de migrations            |
| validate-session-migration.sh  | `scripts/validate-session-migration.sh` | Validar integridad de datos post-migración  |

**Uso de deprecation script**:

```bash
# Dry-run (preview)
node scripts/add-deprecation-headers.js \
  --bcs "crypto-news-integration,crypto-news-publisher,crypto-news-ads" \
  --target "apps/content-publisher" \
  --version "v2.0.0" \
  --eta "2026-10-15"

# Aplicar cambios
node scripts/add-deprecation-headers.js \
  --bcs "crypto-news-integration,crypto-news-publisher,crypto-news-ads" \
  --target "apps/content-publisher" \
  --version "v2.0.0" \
  --eta "2026-10-15" \
  --apply
```

---

## 📊 Progress Tracking

**Last Updated**: [Date]

```
Phase 1: [░░░░░░░░░░] 0/10  (0%) - App Setup
Phase 2: [░░░░░░░░░░] 0/57  (0%) - Shared Module
Phase 3: [░░░░░░░░░░] 0/12  (0%) - Queue + Database
Phase 4: [░░░░░░░░░░] 0/6   (0%) - Ingestion Module
Phase 5: [░░░░░░░░░░] 0/18  (0%) - Matching + Keywords + Filters
Phase 6: [░░░░░░░░░░] 0/9   (0%) - LLM Module
Phase 7: [░░░░░░░░░░] 0/15  (0%) - Deduplication + Scheduling
Phase 8: [░░░░░░░░░░] 0/6   (0%) - Telegram Module
─────────────────────────────────────────────────────
Total:   [░░░░░░░░░░] 0/133 (0%)
```

**Current Phase**: Not started  
**Started**: [Date]  
**Target Completion**: [Date + 7 weeks]  
**Actual Completion**: [Pending]

**Blockers**: None

---

## 🚨 Critical Reminders

1. **NUNCA implementar fases en paralelo** (excepto Phase 5 y 6 después de Phase 4)
2. **Shared module PRIMERO** — todos los demás módulos dependen de él
3. **Tests ANTES de avanzar** — cada fase requiere tests green
4. **Staging validation 7 días** — NO skipear este período
5. **Feature flag para cutover** — `USE_CONTENT_PUBLISHER=true` permite rollback rápido
6. **Deprecation solo POST-cutover** — nunca antes de validar prod

---

## 📞 Support & Questions

- **Slack**: `#content-publisher-migration`
- **Email**: `dev-team@company.com`
- **GitHub Issues**: Tag with `content-publisher-refactor` label
- **Documentation bugs**: Open PR against `.kiro/specs/refactor-content-publisher/`

---

## 📝 Document History

| Version | Date       | Author                 | Changes                   |
| ------- | ---------- | ---------------------- | ------------------------- |
| 1.0     | 2026-09-23 | Content-Publisher Team | Initial release (13 docs) |

---

## ✅ Pre-Implementation Checklist

Antes de comenzar Phase 1, verificar:

- [ ] Todos los stakeholders leyeron `MIGRATION-PLAYBOOK.md`
- [ ] Go/No-Go criteria entendidos (10 checkboxes)
- [ ] Branch creada: `feat/content-publisher-phase-1`
- [ ] `PHASE-TRACKER.md` copiado a workspace root (para easy access)
- [ ] Slack channel `#content-publisher-migration` creado
- [ ] GitHub Project board creado (8 columnas, 1 por fase)
- [ ] DevOps validó puertos disponibles (3040/3041/3042)
- [ ] Monitoring dashboards diseñados (8 panels Grafana)
- [ ] Rollback procedure impreso (mantener a mano durante cutover)

**Signature**: ******\_\_\_\_****** Date: **\_\_\_\_**

---

---

## 🔮 Future Enhancements (v3+ Roadmap)

**Multi-Bot Publishing Profiles** — Full documentation in `11-refactor.md` § ROADMAP (v3+)

Configurable publishing profiles desde el frontend (cada perfil = bot + keywords + queue + template + filters + ads):

**Use Cases**:

- Multi-language (ES/EN/PT con templates localizados)
- Niche streams (Solana, memecoins, DeFi — cada uno con su bot)
- White-label B2B (clientes publican en SU bot con SU branding)

**Quick Stats**:

- Complexity: ~4 semanas (1 sprint)
- Priority: Post-v2 (ETA: Q1 2027)
- Benefits: Multi-tenant revenue, A/B testing, niche targeting, multi-language
- Components: New `PublishingProfile` aggregate, 2 new tables, 8 API endpoints, UI editor modal

**Decision Gate**: Validar v2 threads por 2 meses en prod antes de iniciar v3.

**Ver detalles técnicos**: `11-refactor.md` § ROADMAP (v3+) — incluye schema SQL, API specs, code samples, UI mockups (50+ páginas de spec completa).

---

**¡Éxito con el refactor!** 🚀
