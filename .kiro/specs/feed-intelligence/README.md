# Feed Intelligence System — Especificación v2.0

Sistema de inteligencia template-driven para crypto-news con classification, clustering, ranking, content generation y story tracking.

**Service Name**: `apps/feed-intelligence/`  
**Scope**: SOLO mensajes crypto-news desde ingestion-telegram (NO KOL messages)  
**Output**: Templates configurables consumidos por content-publisher vía API

**Estado**: Propuesta completa v2.0 (Template-Driven + Advanced Features)  
**Última actualización**: 2026-09-25  
**Autor**: AI Assistant + análisis de datos reales en producción

---

## 📚 Documentación

### [01-overview.md](./01-overview.md) — Visión General v2.0

**Para**: Product Manager, Tech Lead, Stakeholders  
**Lectura**: 10 minutos

Visión general del sistema template-driven, 5 bounded contexts, flujo completo desde ingestion hasta content-publisher.

**Contenido clave**:

- 🎯 Visión v2.0: Templates configurables en DB
- 🏗️ 5 Bounded Contexts (Classification, Clustering, Ranking, Aggregation, **Template Management**)
- 📊 BC 5 detalle: ContentTemplate entity + TemplateConfig
- 🔌 API para content-publisher
- 📊 Datos reales de producción (Oracle VPS)

---

### [02-architecture.md](./02-architecture.md) — Arquitectura Técnica v2.0

**Para**: Developers, Architects  
**Lectura**: 30 minutos

Arquitectura detallada con todos los bounded contexts incluyendo **Cluster Synthesis** y **Story Tracking**.

**Contenido clave**:

- 📐 Estructura completa de `apps/feed-intelligence/`
- 🎯 BC 1: Classification (rule-based + LLM fallback)
- 🔗 BC 2: Clustering + **Cluster Synthesis** (LLM merge duplicates instead of discard)
- 📈 BC 3: Ranking (5-dimensional scoring)
- 📰 BC 4: Content Generation (template-driven renderers)
- 📋 BC 5: Template Management + **Story Tracking** (detect news updates, timeline)
- 🗄️ Database schemas v2.0 (8 tables: templates, content, stories, synthesis)
- 🔌 API endpoints completos

---

### [03-infrastructure.md](./03-infrastructure.md) — Infraestructura y Deployment

**Para**: DevOps, SRE, Tech Lead  
**Lectura**: 20 minutos

VPS Oracle resources, LLM Gateway (embeddings), deployment strategy.

**Contenido clave**:

- 🖥️ Análisis VPS (12GB RAM, 7.2GB disponible)
- 🤖 LLM Gateway (bge-small-en-v1.5, ONNX, :4001)
- 📊 Resource estimates (~1.1GB adicional)
- 🚀 Deployment checklist
- 📈 Monitoring & alerts

**Sin cambios vs v1.0**: LLM Gateway igual, solo para crypto-news

---

### [04-content-templates.md](./04-content-templates.md) — Templates y Narrativas v2.0

**Para**: Product Manager, Content Team, Developers  
**Lectura**: 35 minutos

Ejemplos completos de 4 tipos de templates incluyendo **NARRATIVE** con story tracking y cluster synthesis.

**Contenido clave**:

- � Análisis de datos reales (65 msgs/día, patrones detectados)
- �📰 Template 1: **Hourly Highlights** (Top 5, with synthesis)
- 🚨 Template 2: **Breaking News Alert** (score >= 85)
- 📊 Template 3: **Daily Digest** (grouped by category)
- 📖 Template 4: **NARRATIVE** (story tracking + timeline + history synthesis) **NUEVO v2.0**
- � Ejemplos de **Cluster Synthesis**: merge 3 duplicates → 1 comprehensive
- 📖 Ejemplos de **Story Updates**: timeline, update types, synthesized history
- 🎯 Template configs JSONB con `clusterSynthesis` + `storyTracking`

---

### [05-implementation.md](./05-implementation.md) — Roadmap y Testing v2.0

**Para**: Engineering Team, Project Manager  
**Lectura**: 30 minutos

Plan de implementación actualizado (6 phases) incluyendo advanced features.

**Contenido clave**:

- 🎯 **Phase 1**: Classification + Clustering (1 semana)
- � **Phase 2**: Ranking + Basic Content Generation (4 días)
- � **Phase 3**: Template Management (BC5) + Content API (1 semana)
- 🎨 **Phase 4**: Cluster Synthesis (LLM merge duplicates) (1 semana) **NUEVO v2.0**
- 📖 **Phase 5**: Story Tracking (detect updates, timeline, synthesis) (1.5 semanas) **NUEVO v2.0**
- 🚀 **Phase 6**: Content-Publisher Integration (2 días)
- 🧪 Testing strategy (unit, integration, E2E)
- 📊 Success criteria actualizados
- 💰 Cost analysis: $0/mes (self-hosted) + ~$0.80/mes (LLM synthesis + tracking)

---

## 🚀 Quick Start

### Para Product Manager

1. Lee [01-overview.md](./01-overview.md) — visión completa
2. Lee [04-content-templates.md](./04-content-templates.md) — ejemplos de narrativas
3. Revisa roadmap en [05-implementation.md](./05-implementation.md)

### Para Developers

1. Lee [01-overview.md](./01-overview.md) — contexto
2. Lee [02-architecture.md](./02-architecture.md) — diseño técnico
3. Lee [05-implementation.md](./05-implementation.md) — tareas Phase 1

### Para DevOps

1. Lee [03-infrastructure.md](./03-infrastructure.md) — resources & deployment
2. Verifica VPS capacity (7.2GB RAM disponible → 1.1GB necesario)
3. Revisa deployment checklist

---

## 🔄 Flujos de Lectura

### Flujo: "Entender el sistema completo"

01-overview.md → 02-architecture.md → 04-content-templates.md → 05-implementation.md

### Flujo: "Revisar solo narrativas"

01-overview.md (sección BC5) → 04-content-templates.md (Template 4)

### Flujo: "Deployment readiness"

03-infrastructure.md → 05-implementation.md (deployment checklist)

---

## 🎯 Cambios Clave v2.0 vs v1.0

### ❌ Removido (v1.0)

- Templates hardcoded en código
- Digests pre-generados sin configuración
- Content-publisher consume directamente desde aggregation schedulers

### ✅ Agregado (v2.0)

- **Templates en DB** con config JSON flexible
- **Cluster Synthesis** (LLM merge duplicates en lugar de descartar)
- **Story Tracking** (detectar updates, timeline, historia sintetizada)
- **Narrativas** (storytelling con contexto automático)
- **Scoring configurable per-template**
- **API /content/pending** para content-publisher

---

## 📝 Changelog v2.0

### Advanced Features (merged from 06-advanced-features.md)

**Cluster Synthesis**:

- En lugar de eliminar duplicados, el LLM los fusiona en una versión mejorada
- Config: `clusterSynthesis.enabled`, `minClusterSize`, `synthesisPrompt`
- Cache 24h para evitar re-synthesis
- Costo: ~$0.02/día (120 síntesis/día × 150 tokens)

**Story Tracking**:

- Detecta cuando un mensaje es UPDATE de una historia existente
- Embeddings similarity (threshold 0.75) para matching
- Timeline con update types: INITIAL, DEVELOPMENT, RESOLUTION, CORRECTION
- LLM extrae información nueva vs updates previos
- Costo: ~$0.003/día (10 updates + 5 síntesis de historia)

**Total adicional v2.0**: ~$0.80/mes (synthesis + tracking)

---

**Status**: Documentación completa v2.0  
**Próximo paso**: Revisión → Aprobación → Phase 1 implementation

**Contenido**:

- 🖥️ Análisis de Recursos del VPS (2 cores ARM64, 12 GB RAM, 45 GB disk)
- LLM Infrastructure Existente (backend, deduplication, crypto-news-publisher)
- Necesidades para Intelligence System (embeddings, clasificación, re-ranking)
- Propuesta: `apps/llm-gateway/` (ONNX embeddings, puerto :4001)
- Estimación de Recursos (1.1 GB RAM overhead, 300 MB disk)
- Alternativa: Embeddings Externos (OpenAI — NO recomendado)
- 🔐 Security & Operational Considerations
- Monitoring (Prometheus metrics)
- Data Retention policies

---

### [04-content-templates.md](./04-content-templates.md) — Templates de Contenido

**Para**: Product Manager, Content Team, Frontend Developers  
**Lectura**: 20 minutos

Análisis de datos reales de producción y diseño de 6 templates de contenido agregado (digests) basados en patrones detectados.

**Contenido**:

- 📊 Análisis de Datos Reales (DB producción, 291 mensajes, 72h retention)
- Patrones Detectados (breaking news 40%, on-chain 25%, market 20%, regulatory 15%)
- 📰 Templates de Contenido Agregado:
  1. **Hourly Highlights** (Top 5, every hour)
  2. **Daily Digest** (Top 10, 8 AM daily, grouped by category)
  3. **Breaking News Alert** (Top 3, every 15 min, conditional)
  4. **Category Deep Dive** (Top 10 de una categoría, on-demand)
  5. **Weekly Recap** (Top 20 + trends, Monday 8 AM)
  6. **Trending Topics** (Real-time clusters, every hour)
- Implementation Priority (Phase 1: Hourly + Breaking)
- Metrics para Evaluar Templates
- 🎓 Learning from Production Data

---

### [05-implementation.md](./05-implementation.md) — Plan de Implementación

**Para**: Engineering Team, Project Manager  
**Lectura**: 25 minutos

Roadmap completo de implementación con 5 fases, success criteria, costos y testing strategy.

**Contenido**:

- 🛣️ Roadmap de Implementación Completo:
  - **Pre-requisito**: LLM Gateway (3-4 días)
  - **Fase 1**: Classification Rule-Based (5-7 días)
  - **Fase 2**: Clustering Semantic (4-5 días)
  - **Fase 3**: Ranking Multi-Dimensional (4-5 días)
  - **Fase 4**: Aggregation Templates (6-8 días)
  - **Fase 5**: LLM Refinement (3-4 días, opcional)
- 🎯 Plan de Implementación Faseado (original overview.md)
- 📊 Success Criteria por Fase (accuracy, latency, uptime)
- 💰 Cost Analysis (self-hosted vs external APIs)
- 📝 Notas de Implementación
- 🧪 Testing Strategy (unit, integration, E2E)
- 🔐 Security & Privacy considerations

---

## 🎯 Flujo de Lectura Recomendado

### Para Stakeholders / Product Managers

1. `01-overview.md` — Entender el problema y la solución
2. `04-content-templates.md` — Ver los templates de contenido (output)
3. `05-implementation.md` (solo roadmap section) — Timeline y fases

### Para Tech Leads / Architects

1. `01-overview.md` — High-level design
2. `02-architecture.md` — Detalles técnicos
3. `03-infrastructure.md` — Requirements de infra
4. `05-implementation.md` — Execution plan

### Para Developers (implementación)

1. `01-overview.md` — Context
2. `02-architecture.md` — API contracts, DB schemas
3. `05-implementation.md` — Tareas por fase
4. `03-infrastructure.md` (cuando llegue a deployment) — Deploy checklist

### Para DevOps / SRE

1. `03-infrastructure.md` — Primary doc (resources, deployment)
2. `02-architecture.md` (solo deployment sections) — Service config
3. `05-implementation.md` (solo monitoring/security) — Ops considerations

---

## 🚀 Quick Start

Si solo tienes 5 minutos, lee:

- `01-overview.md` — Sección "Visión General" (primeras 50 líneas)
- `04-content-templates.md` — Template 1 (Hourly Highlights) para ver un ejemplo concreto

---

## 📊 Estado del Proyecto

- [x] Análisis de datos reales (producción)
- [x] Diseño de arquitectura (servicio independiente)
- [x] Análisis de recursos VPS (Oracle)
- [x] Diseño de templates de contenido (6 templates)
- [x] Roadmap de implementación (5 fases)
- [ ] **Pendiente**: Aprobación del equipo
- [ ] **Pendiente**: Kick-off Pre-requisito (LLM Gateway)

---

## 🔗 Referencias Externas

- Modelo de embeddings: [bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5)
- ONNX Runtime: [onnxruntime-node](https://www.npmjs.com/package/onnxruntime-node)
- LiteLLM Proxy: [LiteLLM Docs](https://docs.litellm.ai/)
- Ingestion-telegram AGENTS.md: `apps/ingestion-telegram/AGENTS.md`
- Backend AGENTS.md: `apps/backend/AGENTS.md`
- Content-Publisher: `apps/content-publisher/`

---

**Versión**: 1.0  
**Próxima revisión**: Post-aprobación del equipo
