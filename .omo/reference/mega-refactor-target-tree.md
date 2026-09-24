# META APROXIMADA — Tree completo monorepo post-refactor

> **Uso**: incluir en `.omo/plans/mega-refactor-central.md` como meta aproximada (no contrato rígido: el worker puede adaptar nombres manteniendo layout hexagonal + DDD).
> **Decidido 2026-09-24**: orden kol-system → content-publisher → market-data · `apps/market-data` (sellado §7.4) · rama `feat/mega-refactor-tramos`.
> **Fuentes literales**: content-publisher ← `11-refactor.md` §§1-11 · market-data ← `naming-and-architecture.md` Variante A (dir renombrado `onchain-data/` → `market-data/`) · kol-system ← `overview.md` §§Estado-Propuesto/Conexión + `IMPLEMENTATION-GUIDE.md` Ph1-13.
> **Marcas**: `(~)` = nombre patronado por mí siguiendo el hexagonal del repo (el spec no lo fija) · `(futuro)` = fuera de v1.

```
apps/
├── backend/                                    # ADELGAZADO por tramos (post-cleanup sem 10 de cada tramo)
│   └── src/
│       ├── kol/                                # ❌ ELIMINADO Tramo 1 (→ kol-system/kol-identity)
│       ├── telegram/
│       │   ├── ingestion/kol/                  # ❌ ELIMINADO Tramo 1 (→ kol-system/ingestion+extraction+parsing)
│       │   ├── ingestion/crypto-news/          # ❌ ELIMINADO Tramo 2 (→ content-publisher/filters)
│       │   ├── vip-calls/                      # ❌ ELIMINADO Tramo 1 (→ kol-system/*)
│       │   ├── crypto-news-integration/        # ❌ ELIMINADO Tramo 2 (→ content-publisher/ingestion+matching)
│       │   ├── crypto-news-publisher/          # ❌ ELIMINADO Tramo 2 (→ content-publisher/queue+llm+keywords)
│       │   ├── crypto-news-ads/                # ❌ ELIMINADO Tramo 2 (→ content-publisher/scheduling)
│       │   └── shared/                         # ⚠️ PARTIDO C-SHARED-01: KOL bot → Tramo 1, crypto adapters → Tramo 2
│       └── token/enrichment/                   # ⚠️ CONSUMIDO vía ports Tramos 1-2, movido físico Tramo 3 (C-DATA-01)
│
├── frontend/                                   # Sin cambio estructural (C-UX-01: migra endpoints por tramo)
│
├── ingestion-telegram/                         # Sin cambio (C-SSE-01: +2 consumers HTTP/SSE por env)
│
├── kol-system/                                 # ★ TRAMO 1 (11 fases / 9-10 sem, :3050/:3051/:3052)
│   ├── package.json
│   ├── nest-cli.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── docker-compose.yml                      # postgres + redis dev
│   ├── .env.example                            # KOL_SYSTEM_ENABLED, TEMPLATE_ORCHESTRATOR_ENABLED, INGESTION_TELEGRAM_URL, KOL_BOT_TOKEN
│   └── src/
│       ├── main.ts                             # Bootstrap :3050
│       ├── app.module.ts                       # 14 imports
│       ├── ingestion/                          # HTTP + SSE contra ingestion-telegram (polling fallback 1 min)
│       │   ├── application/
│       │   │   ├── services/kol-ingestion-client.service.ts
│       │   │   └── handlers/process-kol-message.handler.ts
│       │   ├── domain/ports/ingestion-client.port.ts
│       │   ├── infrastructure/http/
│       │   │   ├── ingestion-http-client.adapter.ts
│       │   │   └── dto/{raw-kol-message.dto.ts,kol-source.dto.ts}
│       │   └── ingestion.module.ts
│       ├── extraction/                         # BC extracción de candidatos (fix-1: llamada directa, sin event bus)
│       │   ├── application/use-cases/extract-from-message.use-case.ts
│       │   ├── domain/{aggregates/extraction-candidate.aggregate.ts(~),events/candidates-extracted.event.ts(~)}
│       │   └── extraction.module.ts(~)
│       ├── parsing/                            # BC parsing a calls estructuradas
│       │   ├── application/use-cases/parse-from-candidates.use-case.ts
│       │   ├── domain/{aggregates/parsed-call.aggregate.ts(~),events/call-parsed.event.ts(~)}
│       │   └── parsing.module.ts(~)
│       ├── normalization/                      # BC normalización (cap 5000 patrón backend)
│       │   ├── application/use-cases/normalize-call.use-case.ts
│       │   ├── domain/{aggregates/normalized-call.aggregate.ts(~),events/call-normalized.event.ts(~)}
│       │   └── normalization.module.ts(~)
│       ├── enrichment/                         # BC enrichment VÍA PORTS (C-DATA-01, sin providers físicos)
│       │   ├── application/services/enrichment-orchestrator.service.ts(~)
│       │   ├── domain/ports/{price-provider.port.ts(~),holders-provider.port.ts(~),security-provider.port.ts(~)}
│       │   └── enrichment.module.ts(~)
│       ├── classification/                     # ⚠️ PIVOT §7.6 P6: FOLD dentro de templates (sin BC separado)
│       │   └── (config de classification vive por-template: canales, score display, filtros gemas)
│       ├── scoring/                            # BC scoring (v1 + reglas; configurable deprecado con templates)
│       │   ├── application/use-cases/score-token.use-case.ts(~)
│       │   ├── domain/{aggregates/scored-call.aggregate.ts(~),value-objects/score-breakdown.vo.ts(~)}
│       │   └── scoring.module.ts(~)
│       ├── templates/                          # 🆕 BC CORE (sin thread support en Tramo 1 — C1)
│       │   ├── domain/aggregates/publishing-template.aggregate.ts
│       │   ├── application/
│       │   │   ├── use-cases/{create-template.use-case.ts,update-template-config.use-case.ts,activate-template.use-case.ts(~),get-template-rankings.use-case.ts}
│       │   │   └── services/{template-orchestrator.service.ts,ranking-engine.service.ts}
│       │   ├── infrastructure/persistence/typeorm/{entities/{publishing-template.entity.ts,template-source-filter.entity.ts(~),template-metrics.entity.ts(~)},repositories/typeorm-template.repository.ts(~)}
│       │   ├── api/controllers/templates.controller.ts   # 11 endpoints
│       │   └── templates.module.ts(~)
│       ├── approval/                           # BC approval template-aware
│       │   ├── domain/aggregates/call-approval.aggregate.ts
│       │   ├── application/use-cases/{evaluate-approval.use-case.ts,get-pending-approvals.use-case.ts}
│       │   ├── api/controllers/approvals.controller.ts
│       │   └── approval.module.ts(~)
│       ├── publishing/                         # BC multi-bot publishing (KOL_BOT_TOKEN)
│       │   ├── domain/aggregates/publishing-job.aggregate.ts
│       │   ├── application/use-cases/{publish-from-template.use-case.ts,manual-publish.use-case.ts}
│       │   ├── infrastructure/telegram/multi-bot-publisher.adapter.ts
│       │   └── publishing.module.ts(~)
│       ├── tracking/                           # BC tracking + evaluaciones
│       │   ├── application/use-cases/{track-call.use-case.ts(~),evaluate-active-calls.use-case.ts(~)}
│       │   ├── domain/aggregates/tracked-call.aggregate.ts(~)
│       │   ├── api/controllers/tracking.controller.ts(~)
│       │   └── tracking.module.ts(~)
│       ├── kol-identity/                       # ⚠️ PIVOT §7.6 P4: SUPERSEDED — sources+avatar viven en ingestion-telegram (tipos kol|crypto-news); kol-system consume vía HTTP, no guarda perfiles
│       │   ├── application/use-cases/{register-kol.use-case.ts(~),list-kols.use-case.ts(~)}
│       │   ├── domain/aggregates/kol-profile.aggregate.ts(~)
│       │   ├── infrastructure/persistence/typeorm/{entities/kol-profile.entity.ts(~),repositories/typeorm-kol.repository.ts(~)}
│       │   ├── api/controllers/kols.controller.ts(~)
│       │   └── kol-identity.module.ts(~)
│       ├── telegram/                           # Adapters bot KOL (propiedad Tramo 1 — C-SHARED-01/C2)
│       │   ├── application/services/kol-bot-publisher.service.ts(~)
│       │   ├── domain/ports/telegram-publisher.port.ts(~)
│       │   ├── infrastructure/adapters/kol-bot-api.adapter.ts  # KOL_BOT_TOKEN
│       │   └── telegram.module.ts(~)
│       └── shared/                             # Kernel + config + guards + filters
│           ├── kernel/{aggregate-root.ts,entity.ts,value-object.ts,domain-event.ts}(~)
│           ├── config/{app.config.ts,database.config.ts,redis.config.ts,telegram.config.ts}(~)
│           ├── guards/api-key.guard.ts(~)
│           ├── filters/domain-exception.filter.ts(~)
│           └── shared.module.ts(~)
│
├── content-publisher/                          # ★ TRAMO 2 (8 fases / 7 sem, :3040/:3041/:3042)
│   ├── package.json                            # NestJS 11, TypeORM, Bull, OpenAI, Bot API
│   ├── nest-cli.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── docker-compose.yml                      # postgres + redis dev
│   ├── .env.example                            # 25 vars (USE_CONTENT_PUBLISHER en backend)
│   ├── uploads/ads-library/                    # Assets físicos (gitignored, Opción B decidida en spec)
│   └── src/
│       ├── main.ts                             # Bootstrap :3040
│       ├── app.module.ts                       # 11 imports
│       ├── ingestion/
│       │   ├── application/{services/crypto-news-ingestion-client.service.ts,handlers/process-crypto-news-message.handler.ts}
│       │   ├── domain/ports/ingestion-client.port.ts
│       │   ├── infrastructure/http/{ingestion-http-client.adapter.ts,dto/{raw-message.dto.ts,source.dto.ts}}
│       │   └── ingestion.module.ts
│       ├── matching/
│       │   ├── application/{services/{filtered-crypto-news.service.ts,matching-evaluator.service.ts},use-cases/evaluate-message-match.use-case.ts,scheduling/enqueue-matching-cron.scheduler.ts}
│       │   ├── domain/{entities/matching-config.entity.ts,ports/{matching-config-repository.port.ts,keyword-provider.port.ts}}
│       │   ├── infrastructure/persistence/typeorm/{entities/matching-config.entity.ts,repositories/typeorm-matching-config.repository.ts}
│       │   └── matching.module.ts
│       ├── keywords/
│       │   ├── allowed/{application/{services/keyword-evaluator.service.ts,use-cases/{create-keyword.use-case.ts,list-keywords.use-case.ts,delete-keyword.use-case.ts}},domain/{entities/keyword.entity.ts,ports/keyword-repository.port.ts},infrastructure/persistence/typeorm/{entities/keyword.entity.ts,repositories/typeorm-keyword.repository.ts}}
│       │   ├── blocked/{application/{services/blacklist-evaluator.service.ts,use-cases/{create-blacklist-phrase.use-case.ts,list-blacklist-phrases.use-case.ts}},domain/{entities/blacklist-phrase.entity.ts,ports/blacklist-repository.port.ts},infrastructure/persistence/typeorm/{entities/blacklist-phrase.entity.ts,repositories/typeorm-blacklist.repository.ts}}
│       │   ├── compound/{application/{services/compound-evaluator.service.ts,use-cases/{create-compound-group.use-case.ts,evaluate-compound-match.use-case.ts}},domain/{entities/compound-keyword-group.entity.ts,ports/compound-repository.port.ts},infrastructure/persistence/typeorm/{entities/{compound-keyword-group.entity.ts,compound-keyword-item.entity.ts},repositories/typeorm-compound.repository.ts}}
│       │   ├── api/{controllers/{keywords.controller.ts,blacklist.controller.ts,compound.controller.ts},dto/{create-keyword.dto.ts,create-blacklist-phrase.dto.ts,create-compound-group.dto.ts}}
│       │   └── keywords.module.ts
│       ├── filters/
│       │   ├── application/{services/content-filter.service.ts,use-cases/{create-content-filter.use-case.ts,list-channel-filters.use-case.ts,update-content-filter.use-case.ts,delete-content-filter.use-case.ts}}
│       │   ├── domain/{entities/channel-content-filter-config.entity.ts,ports/filter-repository.port.ts}
│       │   ├── infrastructure/persistence/typeorm/{entities/channel-content-filter-config.entity.ts,repositories/typeorm-filter.repository.ts}
│       │   ├── api/{controllers/filters.controller.ts,dto/{create-filter.dto.ts,update-filter.dto.ts}}
│       │   └── filters.module.ts
│       ├── queue/                              # Queue unificado contentType='crypto-news'|'thread'
│       │   ├── application/{services/queue-manager.service.ts,use-cases/{enqueue-matching-message.use-case.ts,process-next-queued-article.use-case.ts,list-queue-entries.use-case.ts},scheduling/{publisher-cron.scheduler.ts,expire-stale-entries.scheduler.ts}}
│       │   ├── domain/{entities/publisher-queue-entry.entity.ts,value-objects/{queue-status.vo.ts,content-type.vo.ts},ports/queue-repository.port.ts}
│       │   ├── infrastructure/persistence/typeorm/{entities/publisher-queue-entry.entity.ts,repositories/typeorm-queue.repository.ts}
│       │   ├── api/{controllers/queue.controller.ts,dto/{queue-entry.dto.ts,enqueue-request.dto.ts}}
│       │   └── queue.module.ts
│       ├── deduplication/
│       │   ├── application/{services/{deduplication.service.ts,content-normalizer.service.ts,url-normalizer.service.ts},use-cases/{check-duplicate.use-case.ts,mark-as-seen.use-case.ts}}
│       │   ├── domain/{entities/dedup-record.entity.ts,value-objects/{content-fingerprint.vo.ts,semantic-embedding.vo.ts},ports/{dedup-repository.port.ts,embedding-generator.port.ts}}
│       │   ├── infrastructure/{persistence/typeorm/{entities/dedup-record.entity.ts,repositories/typeorm-dedup.repository.ts},embeddings/{openai-embeddings.adapter.ts,mock-embeddings.adapter.ts}}
│       │   └── deduplication.module.ts
│       ├── llm/
│       │   ├── config/{application/use-cases/{get-llm-config.use-case.ts,update-llm-config.use-case.ts,get-llm-models.use-case.ts},domain/{entities/llm-config.entity.ts,ports/llm-config-repository.port.ts},infrastructure/persistence/typeorm/{entities/llm-config.entity.ts,repositories/typeorm-llm-config.repository.ts}}
│       │   ├── templates/{application/use-cases/{create-template.use-case.ts,list-templates.use-case.ts,activate-template.use-case.ts},domain/{entities/prompt-template.entity.ts,ports/template-repository.port.ts},infrastructure/persistence/typeorm/{entities/prompt-template.entity.ts,repositories/typeorm-template.repository.ts}}
│       │   ├── core/{application/services/{llm-generator.service.ts,prompt-builder.service.ts,content-validator.service.ts},domain/ports/{llm-client.port.ts,template-renderer.port.ts},infrastructure/adapters/{openai-llm.adapter.ts,mock-llm.adapter.ts}}
│       │   ├── playground/{application/use-cases/generate-preview.use-case.ts,api/{controllers/playground.controller.ts,dto/{preview-request.dto.ts,preview-response.dto.ts}}}
│       │   ├── api/{controllers/{llm-config.controller.ts,templates.controller.ts,models.controller.ts},dto/{update-llm-config.dto.ts,create-template.dto.ts}}
│       │   └── llm.module.ts
│       ├── scheduling/                         # Ads (renombrado crypto-news-ads, crypto-news only)
│       │   ├── core/{application/{services/{ad-rotation.service.ts,ad-scheduler.service.ts},use-cases/{create-ad.use-case.ts,list-ads.use-case.ts,update-rotation-config.use-case.ts,get-next-ad.use-case.ts},scheduling/ads-cron.scheduler.ts},domain/{entities/{ad.entity.ts,ad-rotation-config.entity.ts,ad-rotation-state.entity.ts},ports/{ad-repository.port.ts,rotation-config-repository.port.ts}},infrastructure/persistence/typeorm/{entities/{ad.entity.ts,ad-rotation-config.entity.ts,ad-rotation-state.entity.ts},repositories/{typeorm-ad.repository.ts,typeorm-rotation-config.repository.ts}}}
│       │   ├── media/{application/{services/ad-media-library.service.ts,use-cases/{create-ad-media.use-case.ts,list-ad-media.use-case.ts,delete-ad-media.use-case.ts}},domain/{entities/{ad-media.entity.ts,ad-media-library.entity.ts},ports/ad-media-repository.port.ts},infrastructure/persistence/typeorm/{entities/{ad-media.entity.ts,ad-media-library.entity.ts},repositories/typeorm-ad-media.repository.ts}}
│       │   ├── api/{controllers/{ads.controller.ts,rotation-config.controller.ts,ad-media.controller.ts},dto/{create-ad.dto.ts,upload-ad-media.dto.ts}}
│       │   └── scheduling.module.ts
│       ├── threads/                            # (futuro v2 — esqueleto en Tramo 2, C1 lo conecta con kol)
│       │   ├── application/{services/{thread-builder.service.ts,thread-scheduler.service.ts},use-cases/{create-thread.use-case.ts,enqueue-thread.use-case.ts,publish-thread.use-case.ts},scheduling/thread-publisher-cron.scheduler.ts}
│       │   ├── domain/{entities/{thread.entity.ts,thread-message.entity.ts},ports/thread-repository.port.ts}
│       │   ├── infrastructure/persistence/typeorm/{entities/{thread.entity.ts,thread-message.entity.ts},repositories/typeorm-thread.repository.ts}
│       │   ├── api/{controllers/threads.controller.ts,dto/{create-thread.dto.ts,enqueue-thread.dto.ts}}
│       │   └── threads.module.ts
│       ├── telegram/                           # Adapters crypto-news + threads (NO KOL — C-SHARED-01/C2)
│       │   ├── application/services/{crypto-news-bot-publisher.service.ts,threads-bot-publisher.service.ts}
│       │   ├── domain/ports/telegram-publisher.port.ts
│       │   ├── infrastructure/adapters/{crypto-news-bot-api.adapter.ts,threads-bot-api.adapter.ts}
│       │   └── telegram.module.ts
│       └── shared/
│           ├── domain/{value-objects/{channel-id.vo.ts,message-id.vo.ts,content-hash.vo.ts,content-type.vo.ts,timestamp.vo.ts,url.vo.ts,language-code.vo.ts},events/{base/{domain-event.base.ts,event-metadata.ts},content/{message-matched.event.ts,queue-entry-created.event.ts,content-published.event.ts,thread-created.event.ts},system/{health-check-failed.event.ts,rate-limit-exceeded.event.ts}},exceptions/{domain-exception.ts,validation-exception.ts,not-found-exception.ts,business-rule-violation.exception.ts}}
│           ├── infrastructure/{persistence/typeorm/{typeorm.config.ts,base-repository.ts,transaction-manager.ts,naming-strategy.ts},migrations/{1788659125192-SplitLlmConfigFlags.ts,1860000000000-AddQueuedAtColumn.ts},http/{http-client.service.ts,interceptors/{logging.interceptor.ts,auth.interceptor.ts,error-mapping.interceptor.ts},retry-strategy.ts},cache/{cache.interface.ts,redis-cache.adapter.ts,memory-cache.adapter.ts,cache-key-builder.ts},messaging/{event-bus.service.ts,event-handler.decorator.ts},monitoring/{logger.service.ts,metrics.service.ts,health-indicator.interface.ts},security/{encryption.service.ts,hashing.service.ts,rate-limiter.service.ts}}
│           ├── application/{decorators/{transactional.decorator.ts,cacheable.decorator.ts,rate-limit.decorator.ts},filters/{http-exception.filter.ts,domain-exception.filter.ts,validation.filter.ts}}
│           ├── config/{app.config.ts,database.config.ts,redis.config.ts,telegram.config.ts,llm.config.ts,config.module.ts}
│           ├── guards/api-key.guard.ts
│           └── shared.module.ts(~)
│
└── market-data/                                # ★ TRAMO 3 (Variante A BC único; puertos/DB en C-PORTS-01/C-DB-01)
    ├── package.json nest-cli.json tsconfig.json Dockerfile docker-compose.yml .env.example(~)
    └── src/
        ├── main.ts
        ├── app.module.ts                       # 6 imports
        ├── token/                              # Agregado TokenSnapshot
        │   ├── domain/{aggregates/token-snapshot.aggregate.ts,value-objects/{token-id.vo.ts,price-data.vo.ts,liquidity-data.vo.ts,holders-data.vo.ts},events/{token-snapshot-created.event.ts,token-data-updated.event.ts},ports/{token-repository.port.ts,price-provider.port.ts,holders-provider.port.ts,security-provider.port.ts}}
        │   ├── application/{use-cases/{get-token-snapshot.use-case.ts,aggregate-token-data.use-case.ts,batch-aggregate-tokens.use-case.ts},services/{token-aggregator.service.ts,price-aggregator.service.ts,holders-aggregator.service.ts,security-aggregator.service.ts}}
        │   └── infrastructure/{persistence/typeorm/{entities/token-snapshot.entity.ts,repositories/typeorm-token.repository.ts},providers/{price/{dexscreener-price.adapter.ts,geckoterminal-price.adapter.ts,coingecko-price.adapter.ts},holders/{geckoterminal-holders.adapter.ts,helius-holders.adapter.ts,moralis-holders.adapter.ts},security/{rugcheck-security.adapter.ts,birdeye-security.adapter.ts}},http/rest/{token.controller.ts,batch.controller.ts}}
        ├── chain/                              # Agregado Chain (catálogo estático + probers)
        │   ├── domain/{aggregates/chain.aggregate.ts,value-objects/{chain-id.vo.ts,chain-capability.vo.ts},ports/{chain-repository.port.ts,chain-detector.port.ts}}
        │   ├── application/{use-cases/{detect-chain.use-case.ts,get-chain.use-case.ts,list-chains.use-case.ts},services/chain-detector.service.ts}
        │   └── infrastructure/{persistence/static-chain.repository.ts,probers/{evm-chain-prober.adapter.ts,solana-chain-prober.adapter.ts},http/chain.controller.ts}
        ├── provider/                           # Agregado ProviderStatus (health)
        │   ├── domain/{aggregates/provider-status.aggregate.ts,value-objects/{provider-name.vo.ts(~),rate-limit-info.vo.ts(~)},ports/provider-health-checker.port.ts(~)}
        │   ├── application/{use-cases/{check-provider-health.use-case.ts,get-provider-status.use-case.ts},services/health-checker.service.ts(~)}
        │   └── infrastructure/{health-checkers/{dexscreener-health.adapter.ts,helius-health.adapter.ts},http/provider.controller.ts}
        ├── cache/
        │   ├── domain/ports/cache.port.ts
        │   ├── application/services/cache.service.ts
        │   └── infrastructure/{adapters/{redis-cache.adapter.ts,memory-cache.adapter.ts},interceptors/cache.interceptor.ts}
        ├── rate-limiter/
        │   ├── domain/{value-objects/rate-limit-config.vo.ts(~),ports/rate-limiter.port.ts}
        │   ├── application/services/{rate-limiter.service.ts,circuit-breaker.service.ts}
        │   └── infrastructure/adapters/redis-rate-limiter.adapter.ts
        └── shared/
            ├── kernel/{aggregate-root.ts,entity.ts,value-object.ts,domain-event.ts}
            ├── value-objects/{chain-id.vo.ts,token-id.vo.ts}
            └── guards/api-key.guard.ts
```

**Notas para el plan**: (1) `src/` como prefijo (README content-publisher; 11-refactor mezcla con/without — manda `src/`). (2) kol-system: solo templates/approval/publishing/telegram-conexión son literales del spec; resto BCs patronados `(~)`. (3) market-data: Variante A literal con dir renombrado; si escala → Variante B (apps/api+bot+worker, libs/) como fase posterior. (4) DBs/migraciones por app en C-DB-01, no en el tree. (5) `market-data` legacy (`/token/market-data`, `MarketDataProviderPort`) se renombra dentro del Tramo 3 (R-4).
