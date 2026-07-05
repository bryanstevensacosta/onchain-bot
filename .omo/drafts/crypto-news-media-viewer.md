---
slug: crypto-news-media-viewer
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/crypto-news-media-viewer.md
approach: Envolver <img> en <a> para abrir imagen en grande + preparar soporte para video.
---

# Draft: crypto-news-media-viewer

## Findings

1. `apps/frontend/src/pages/crypto-news/index.tsx:176-184` — `<img>` sin click handler
2. No hay soporte de video backend (solo `MessageMediaPhoto`)

## Decision

1. **Imágenes**: wrapper `<a href={url} target="_blank">` alrededor de cada `<img>` para abrir en nueva pestaña a resolución completa. Sin dependencias externas, sin lightbox modal (puede añadirse después).
2. **Videos**: requiere backend (extraer `MessageMediaDocument` con `mimeType.startsWith('video/')`) + frontend (elemento `<video>` con controles). Scope separado.
