# threads-publisher-spike — Draft

status: awaiting-approval
pending_action: write .omo/plans/threads-publisher-spike.md
approach: validación trivial en 3 niveles (curl manual → spike script → publisher completo solo si pasa)

## Intent routing

Intent: UNCLEAR — "validar si es posible, requisitos, curva, probar rápido un post, dame ideas" es outcome abierto. Se investiga a best-practice, no se interroga. Defaults anunciados para veto en gate.

## Key facts (verificados)

- Repo publica hoy vía 2 familias: vip-channel (síncrono, evento vip-call.approval.approved → VipCallsPublishUseCase → TelegramPublisherPort.sendMessage → Bot API, 1msg/min) y crypto-news-publisher (encolado + cron cada minuto + lock 7421371 + queue cap 36, template a copiar para Threads). Refs: apps/backend/src/telegram/vip-calls/vip-channel/application/handlers/vip-calls-publish.use-case.ts:107-118, apps/backend/src/telegram/crypto-news-publisher/application/scheduling/publisher-cron.scheduler.ts:69-98, .../application/handlers/process-next-queued-article.use-case.ts:83-176.
- Threads API: factible, gratis, self-serve. Requiere Meta App con Threads Use Case (usar Threads App ID, no Facebook). Scopes: threads_basic + threads_content_publish para texto. OAuth → short token 1h → long 60d → refresh si ≥24h y no expirado. Publicar texto = 2 pasos: POST /{user-id}/threads (media_type=TEXT) → POST /{user-id}/threads_publish (esperar ~30s). Host graph.threads.net/v1.0. Docs: developers.facebook.com/docs/threads/get-started (30-jun-2026), /docs/threads/posts, /documentation/threads/overview (22-dic-2025).
- Sin App Review para probar en cuentas propias: añadir como Threads Tester en App roles, acepta invite. Review solo para público. Costo $0.
- Límites: 250 posts/24h por perfil, texto 500 chars, >5 links rechazado, API general 4800×impressions/24h. Chequear con GET /threads_publishing_limit.
- Grant: perfiles públicos 90 días (refresh extiende); privados refresh de token sí pero grant no auto-extiende → re-auth cada 90d.
- Cambios 2025-2026: GIF, spoiler, text attachments 10K, webhooks publish/delete, topic_tag 1×50 chars.

## Components (topology lock, 1-6)

1. Validez cuenta/app (OAuth + tester + scopes)
2. Prueba manual trivial (curl/Explorer, 0 código)
3. Spike mínimo repo (script temporal, valida token + 2-step desde Node)
4. Publisher completo (nuevo BC threads-publisher clonando crypto-news-publisher) — diferido
5. Operación (refresh token 60d, re-auth 90d privados, quota check)

## Open-assumptions (defaults adoptados)

- Default: NO construir publisher completo aún; primero spike manual+script. Rationale: pide "trivial, probar rápido". Reversible: sí.
- Default: texto plano primero (media_type=TEXT), sin imágenes/carrusel. Rationale: menor fricción, media exige hosting público. Reversible: sí.
- Default: si spike pasa, clonar crypto-news-publisher (queue + cron + lock propio + SlotScope threads), no vip-channel síncrono. Rationale: convención repo, throttling + caps. Reversible: sí.
- Default: token long-lived en env/secret manager + cron refresh, no en DB. Rationale: secreto rotativo. Reversible: sí. Owner-decision: qué cuenta Threads conecta (pública recomendada) — se deja al gate.

## Approval gate

Brief presentado, esperando okay explícito para escribir .omo/plans/threads-publisher-spike.md. Scope-change → ajustar draft. Still-unclear → una línea.
