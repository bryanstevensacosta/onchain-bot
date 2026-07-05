---
slug: crypto-news-layout-consistency
status: approved
intent: clear
pending-action: write .omo/plans/crypto-news-layout-consistency.md
approach: Reemplazar todo el rendering de articles por un layout fijo y consistente estilo chat Telegram, eliminando componentes y lógica redundante que causan variaciones en cómo se muestran los posts.
---

# Draft: crypto-news-layout-consistency

## Findings

1. **La página tiene 39 mensajes** de 6 fuentes distintas con layouts inconsistentes porque:
   - `CryptoNewsMediaGrid` checkea aspect ratio onLoad y cambia de `grid-cols-2` a `grid-cols-1` dinámicamente → causa reflow visual
   - El filter de link preview duplica el primer media item
   - No hay un layout fijo único para todos los articles
   - Los link previews se renderizan como card separada pero no siempre aparece (depende si msg.linkPreviewUrl no es null)
2. **El orden actual**: metadata → mediaGrid (fotos) → texto → linkPreview (si existe)
3. **Comportamiento deseado**: un layout fijo, predecible, estilo Telegram chat, que funcione igual para todos los posts

## Decisions

1. **Layout fijo único** para cada article (sin cambios dinámicos de CSS):
   ```
   article (rounded bubble, dark bg)
     metadata (handle · msg N · hace X)
     images (grid fija: grid-cols-1 sm:grid-cols-2 si hay 2+)
     text content
     link preview card (si msg.linkPreviewUrl existe)
   ```
2. **Eliminar `CryptoNewsMediaGrid`** — reemplazar por inline grid sin detección de aspect ratio. Usar siempre `grid-cols-1 sm:grid-cols-2` para 2+ imágenes, `grid-cols-1` para 1 imagen.
3. **No más detección de fotos cuadradas** — el reflow visual es peor que el beneficio. Si el usuario quiere fotos al lado, que siempre estén en 2 columnas en desktop.
4. **Link preview**: la foto del preview SIEMPRE dentro del card, NUNCA en la grilla de fotos de arriba.

## Scope IN

- Layout fijo y consistente para todos los posts
- Eliminar `CryptoNewsMediaGrid` y su lógica de aspect ratio
- Los link previews con foto se muestran correctamente
- Responsive: mobile 1 columna, desktop 2 columnas para 2+ fotos

## Scope OUT

- No cambiar backend
- No cambiar datos de la API
- No cambiar tests existentes (deben seguir pasando)
- No cambiar el filtro ni otros componentes de la página

## Approval gate

status: approved
