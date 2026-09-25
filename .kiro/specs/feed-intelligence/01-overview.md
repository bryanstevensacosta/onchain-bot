# Sistema de Inteligencia Template-Driven para Crypto-News

**Autor**: AI Assistant  
**Fecha**: 2026-09-25  
**Estado**: Propuesta v2.0  
**Versión**: 2.0

## 🎯 Visión General

Sistema de **inteligencia ML/AI para crypto-news** con templates configurables que genera contenido listo para publicación en content-publisher.

**Input**: Mensajes crypto-news desde ingestion-telegram (NO KOL messages)  
**Output**: Contenido formateado según templates configurables en DB

### Pipeline

1. **Clasificación** → Taxonomía semántica (17 categorías)
2. **Clustering** → Agrupación de contenido similar/duplicado
3. **Ranking** → Priorización multi-dimensional (0-100 score)
4. **Template Rendering** → Generación de contenido según configuración

### Características v2.0

- ✅ **Templates en DB** (configurables vía UI)
- ✅ **Narrativas** como template type (storytelling con contexto)
- ✅ **Scoring configurable per-template**
- ✅ **API para content-publisher** (/content/pending, /content/:id/consume)
- ✅ **Schedulers dinámicos** basados en template.config.schedule

## 🏗️ Arquitectura Propuesta

### Ubicación en el Monorepo

**Nuevo servicio independiente**: `apps/feed-intelligence/`

**Rationale**:

1. **Separación de responsabilidades**: Backend (alpha-calls) vs Intelligence (crypto-news processing)
2. **Escalabilidad independiente**: CPU-intensive tasks aisladas
3. **Deploy independiente**: rollback sin afectar backend
4. **Templates configurables**: almacenados en DB, modificables vía UI

### Bounded Contexts (5)

#### BC 1: Classification

- **Propósito**: Asignar categorías semánticas a mensajes RAW
- **Estrategia**: Rule-based primary (80%+), LLM fallback opcional
- **Taxonomía**: 17 categorías en 5 grupos (Market Events, Business, Security, Market Analysis, Regulatory)

#### BC 2: Clustering

- **Propósito**: Detectar mensajes similares/duplicados
- **Técnica**: Semantic similarity via embeddings (threshold 0.7)
- **Output**: `NewsCluster` con representative + members

#### BC 3: Ranking

- **Propósito**: Priorizar mensajes por relevancia
- **Scoring**: Multi-dimensional (temporal 30%, engagement 25%, source 20%, category 15%, uniqueness 10%)
- **Características**: Computed on-read, cache 5 min TTL

#### BC 4: Aggregation (refactored)

- **Propósito**: Orquestar generación de contenido según templates
- **Inputs**: Templates de BC5 + ranked messages de BC3
- **Output**: `GeneratedContent` listo para content-publisher

#### BC 5: Template Management (NEW)

- **Propósito**: CRUD templates + render engine
- **Storage**: Templates en DB con config JSON
- **Types**: HIGHLIGHTS, DIGEST, BREAKING, NARRATIVE
- **API**: Serve content to content-publisher

### Flujo de Datos Completo

```
Telegram → Ingestion-telegram (RAW storage type=crypto-news)
              ↓
Intelligence polling (every 30s)
              ↓ GET /api/feed/messages?type=crypto-news
    ClassifyNewsMessageUseCase
              ↓
    ClusteringCronScheduler (every 5 min)
              ↓
    RankNewsFeedUseCase (on-demand)
              ↓
TemplateSchedulerOrchestrator
  (lee content_templates.config.schedule)
              ↓
    Render template → Save generated_content
              ↓
Content-Publisher (polling cada minuto)
              ↓ GET /content/pending?templateType=narrative
    Format → Queue → Bot API publish
              ↓ POST /content/:id/consume
    Mark as consumed
```

## 📊 BC 5: Template Management (Detalle)

### ContentTemplate Entity

```typescript
export class ContentTemplate extends AggregateRoot<string> {
  public readonly id: string;
  public name: string; // "Hourly Top 5", "Daily Narrative"
  public type: TemplateType; // HIGHLIGHTS | DIGEST | BREAKING | NARRATIVE
  public active: boolean;
  public config: TemplateConfig;
  public createdAt: Date;
  public updatedAt: Date;
}

export enum TemplateType {
  HIGHLIGHTS = 'highlights', // Top N más relevantes
  DIGEST = 'digest', // Agrupado por categoría
  BREAKING = 'breaking', // Alta prioridad (score >= 85)
  NARRATIVE = 'narrative', // Storytelling con contexto
}

export interface TemplateConfig {
  // Query
  limit: number;
  minRelevanceScore: number;
  timeWindowHours: number;

  // Scoring overrides (per-template)
  scoringWeights?: {
    temporal?: number;
    engagement?: number;
    sourceQuality?: number;
    category?: number;
    uniqueness?: number;
  };

  // Filtering
  includedCategories?: NewsCategory[];
  excludedCategories?: NewsCategory[];
  priorityCategories?: NewsCategory[];

  // Narrative (solo type=NARRATIVE)
  narrativeConfig?: {
    mode: 'chronological' | 'thematic' | 'clustered';
    groupByCategory: boolean;
    includeContext: boolean; // Genera texto de conexión
    maxClustersPerNarrative: number;
  };

  // Rendering
  renderFormat: 'markdown' | 'html' | 'plain';
  includeEmojis: boolean;
  includeSourceAttribution: boolean;
  includeMetadata: boolean;

  // Scheduling
  schedule?: {
    enabled: boolean;
    cron: string; // "0 * * * *" = hourly
  };
}
```

### Database Schema

```sql
-- Templates configurables
CREATE TABLE content_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(128) NOT NULL,
  type VARCHAR(32) NOT NULL CHECK (type IN ('highlights', 'digest', 'breaking', 'narrative')),
  active BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(64)
);

CREATE INDEX idx_content_templates_active ON content_templates(active) WHERE active = true;
CREATE INDEX idx_content_templates_type ON content_templates(type);

-- Content generado (cache)
CREATE TABLE generated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES content_templates(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  time_window_start TIMESTAMPTZ NOT NULL,
  time_window_end TIMESTAMPTZ NOT NULL,
  content TEXT NOT NULL,
  message_ids JSONB NOT NULL,      -- [{channelId, messageId}, ...]
  metadata JSONB NOT NULL,         -- Stats
  consumed BOOLEAN DEFAULT FALSE,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX idx_generated_content_template ON generated_content(template_id);
CREATE INDEX idx_generated_content_generated ON generated_content(generated_at DESC);
CREATE INDEX idx_generated_content_unconsumed ON generated_content(consumed) WHERE consumed = FALSE;
```

## 🔌 API Endpoints

### Template Management (admin/frontend)

```
POST   /templates              # Create template
GET    /templates              # List (filter by type/active)
GET    /templates/:id          # Get by ID
PUT    /templates/:id          # Update config
DELETE /templates/:id          # Delete
POST   /templates/:id/generate # Manual generation
```

### Content Consumption (content-publisher)

```
GET  /content/pending?templateType=narrative&limit=10
     → Lista content NO consumido

GET  /content/latest/:templateId
     → Latest generated por template

POST /content/:id/consume
     → Marca como consumido (publicado)
```

## 🚀 Ventajas de esta Arquitectura

1. **Configurabilidad**: Templates modificables sin redeploy
2. **Escalable**: Agregar template = INSERT en DB
3. **Content-publisher desacoplado**: Consume vía API, no depende de schedulers
4. **Narrativas**: Storytelling automático con contexto
5. **Fail-open**: Errores en intelligence NO bloquean ingestion
6. **DDD-compliant**: 5 BCs con responsabilidades claras

## 📊 Datos Reales (Producción)

**DB**: `alpha_meta_token_scanner_ingestion` (Oracle VPS)

**Volumen**: ~20 mensajes/día (últimas 48h)

**Top fuentes**:

1. Watcher Guru — Breaking news
2. Shoal Research Hub — Research
3. Cointelegraph — Established media
4. Lookonchain — On-chain analytics
5. unfolded. DeFi — DeFi analysis

**Patrones de contenido**:

- 40% Breaking news (JUST IN:, 🚨, emojis)
- 25% On-chain activity (whale tracking)
- 20% Regulatory/Legal (SEIZES, enforcement)
- 15% Market analysis (institutional)

**Media distribution**:

- 70% text-only
- 30% con 1 imagen
- Videos: <5%

---

**Ver documentos relacionados**:

- [02-architecture.md](./02-architecture.md) — Diseño detallado de BCs
- [03-infrastructure.md](./03-infrastructure.md) — VPS, LLM Gateway
- [04-content-templates.md](./04-content-templates.md) — Ejemplos de templates (incluye narrativas)
- [05-implementation.md](./05-implementation.md) — Roadmap faseado
