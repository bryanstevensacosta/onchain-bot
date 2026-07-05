# crypto-news-media-grouping - Work Plan

## TL;DR (For humans)

**What you'll get:** Cuando publiques 2+ fotos juntas en Telegram, aparecen como un solo post en el dashboard con todas las fotos, no como posts separados.

**Why this approach:** Telegram usa `groupedId` para marcar mensajes que pertenecen al mismo álbum. Solo hay que extraerlo, almacenarlo y agruparlos en el frontend.

**Effort:** Short (~6 archivos)
**Risk:** Low

## Todos

- [ ] 1. Extraer `groupedId` en el listener + persistir en DB + exponer en API
     What to do:
  - **TelegramRawMessage** (telegram-listener.port.ts): Añadir campo opcional `groupedId?: string | number`
  - **Adapter** (telegram-mtproto-listener.adapter.ts): En los 3 paths, añadir `groupedId: (msg as any).groupedId ?? null` (o `undefined` si no existe)
  - **Domain entity**: Añadir `groupedId: string | null` a Props + getter + create input opcional
  - **TypeORM entity**: Añadir columna `grouped_id` (VARCHAR(64), nullable)
  - **Mapper**: Mapear bidireccionalmente
  - **Controller**: Exponer `groupedId: string | null` en view
  - **IngestionCoordinator**: Pasar `raw.groupedId` al use case

- [ ] 2. Frontend: agrupar mensajes por `groupedId`
     What to do:
  - **Types**: Añadir `groupedId?: string | null` a `CryptoNewsMessage`
  - **Page** (index.tsx):
    - Antes de `filteredMessages.map`, agrupar mensajes consecutivos con el mismo `groupedId`:
    ```tsx
    const groupedMessages = useMemo(() => {
      const groups: (typeof filteredMessages)[number][] = [];
      let i = 0;
      while (i < filteredMessages.length) {
        const curr = filteredMessages[i];
        const next = filteredMessages[i + 1];
        if (curr.groupedId && next?.groupedId === curr.groupedId) {
          groups.push({
            ...curr,
            content: curr.content || next.content,
            media: [...curr.media, ...next.media],
          });
          i += 2;
        } else {
          groups.push(curr);
          i += 1;
        }
      }
      return groups;
    }, [filteredMessages]);
    ```
    - Reemplazar `filteredMessages.map` por `groupedMessages.map`
    - El merge concatena `media` y usa `content` del primer mensaje (fallback al segundo si está vacío)
    - Agregar badge "🖼️ N photos" en el metadata si el mensaje tiene media agrupada
    - NO modificar el layout existente del article (imágenes arriba, texto abajo, link preview)

## Verification

- msg 24 + 25 se muestran como un solo post con 2 fotos
- Mensajes sin `groupedId` se muestran normalmente
- Tests existentes pasan

## Commits

1. `feat(crypto-news): extract and persist groupedId for media albums`
2. `feat(frontend): group consecutive messages by groupedId`
