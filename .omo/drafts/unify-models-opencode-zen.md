---
slug: unify-models-opencode-zen
status: drafting
intent: clear
pending-action: write .omo/plans/unify-models-opencode-zen.md
approach: Restaurar ~/.config/opencode/oh-my-openagent.json desde bak-20260925-005917 y unificar top-level model a opencode-zen/muse-spark-1.3-contributor-free; todo verificado por parsing JSON sin tocar codigo del repo
---

# Draft: unify-models-opencode-zen

## Components (topology ledger)

- C1 backup | copia timestamped de opencode.json + inventario de baks antes de tocar nada | status: active | evidence: ~/.config/opencode/opencode.json:1-76
- C2 restore agents/categories | (re)crear oh-my-openagent.json con los 12 mapeos a opencode-zen/muse-spark | status: active | evidence: ~/.config/opencode/oh-my-openagent.json.bak-20260925-005917:1-71
- C3 top-level model | cambiar opencode/ por opencode-zen/ en opencode.json:75 | status: active | evidence: ~/.config/opencode/opencode.json:75
- C4 verify | JSON valido + cero restos gpt/gemini/claude + carga efectiva | status: active | evidence: plugin dist/index.js CATEGORY_MODEL_REQUIREMENTS

## Open assumptions (announced defaults)

- Fuente de restauracion: bak-20260925-005917 (el mas reciente con muse-spark, 25-sep 00:59) | rationale: ya contenia los 12 migrados | reversible? si (backup previo)
- Prefijo canonico: opencode-zen/ (decision explicita del usuario) | rationale: provider Zen | reversible? si
- momus conserva "fallback_models": [] | rationale: asi estaba en el bak:37-40 | reversible? si

## Findings (cited - path:lines)

- ~/.config/opencode/opencode.json:75 = "opencode/muse-spark-1.3-contributor-free" (prefijo viejo, unico model definido; resto del archivo: plugin oh-my-openagent, mcp with-context/MiniMax, providers llmgw deshabilitados)
- ~/.config/opencode/oh-my-openagent.json NO existe (solo .bak-\*); sin el, el plugin usa defaults internos = los 12 modelos listados por el usuario (gpt-5.5, gemini-3.1-pro, claude-sonnet-4-6, claude-opus-4-7, gpt-5.4-mini[-fast], default)
- bak-20260925-005917:1-71 ya tenia TODO a opencode-zen/muse-spark-1.3-contributor-free: agents sisyphus/librarian/explore/oracle/frontend-ui-ux-engineer/document-writer/multimodal-looker/prometheus/atlas/metis/hephaestus/momus/sisyphus-junior + categories quick/unspecified-low/unspecified-high/visual-engineering/artistry/ultrabrain/deep/writing
- Metis (manual, subagentes task con model access disabled): gaps cubiertos = prefijo inconsistente opencode/ vs opencode-zen/, momus fallback_models debe preservarse, no commitear configs globales, no tocar /Users/bryanstevens/dev/onchain-bot/opencode.json (no define modelos)

## Decisions (with rationale)

- Restaurar desde bak-20260925-005917 y no re-escribir a mano: evita typos en 20 bloques model
- Unificar top-level a opencode-zen/muse-spark-1.3-contributor-free: pedido explicito "debe ser opencode-zen"
- Sin cambios en el repo onchain-bot: son configs globales fuera de git

## Scope IN

- Backup, restore oh-my-openagent.json, fix top-level model, verificacion JSON + grep de restos

## Scope OUT (Must NOT have)

- NO tocar apps/backend|frontend|ingestion-telegram ni opencode.json del repo; NO migrar prefijos de providers/keys; NO borrar .bak-\*; NO commitear ~/.config

## Open questions

- Ninguna; clearance OK (objetivo + scope + approach + QA confirmados; "si, debe ser opencode-zen" = aprobacion del prefijo)

## Approval gate

status: drafting
pending-action: write .omo/plans/unify-models-opencode-zen.md
