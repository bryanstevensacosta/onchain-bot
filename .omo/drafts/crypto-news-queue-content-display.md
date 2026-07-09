---
slug: crypto-news-queue-content-display
status: approved
intent: clear
pending-action: add todos to plan and implement
approach: Expose rawContent + imageUrl in queue view API, render in frontend QueueRow.
---

# Draft: crypto-news-queue-content-display

## Findings
1. `QueueEntryView` (backend + frontend) no incluye `rawContent`
2. `imagePath` está disponible pero es un path local de disco, no una URL web
3. La foto de crypto-news se sirve via `/crypto-news/media/:uuid` (en el BC de ingesta)
4. No hay campo `mediaUrl` en `PublisherQueueEntry`

## Decisions
1. **Backend**: añadir `rawContent` a `QueueEntryView` y `toView()`. Añadir `imageUrl` (derivado de `imagePath` como URL si existe).
2. **Frontend**: añadir `rawContent` a `QueueEntryView` + `QueueRow` renderiza el texto + imagen si `imageUrl` existe.
3. **Urgente**: el usuario quiere ver el contenido del mensaje en la cola antes de que se publique. `rawContent` es lo más importante. La imagen es secundaria.
