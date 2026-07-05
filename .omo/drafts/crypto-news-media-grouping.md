---
slug: crypto-news-media-grouping
status: approved
intent: clear
pending-action: write .omo/plans/crypto-news-media-grouping.md
approach: Extraer groupedId del mensaje Telegram, persistir en DB, agrupar en frontend.
---

# Draft: crypto-news-media-grouping

## Findings

1. msg 24 (canal 4466661332): texto + 1 foto. msg 25: 1 foto con contenido vacío. Son un álbum Telegram (mismo `groupedId`)
2. gramjs Message tiene `groupedId?: any` (en custom/message.d.ts:32)
3. El listener actual no extrae `groupedId`

## Decisions

1. **Extraer `groupedId`** en el listener como campo opcional
2. **Persistir** en columna `grouped_id` (varchar, nullable)
3. **Frontend**: agrupar mensajes consecutivos por `groupedId` en un solo article
