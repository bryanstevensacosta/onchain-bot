---
slug: crypto-news-lightbox
status: approved
intent: clear
pending-action: write .omo/plans/crypto-news-lightbox.md
approach: Reemplazar <a> por un lightbox modal nativo (sin librerías externas).
---

# Draft: crypto-news-lightbox

## Findings

1. `apps/frontend/src/pages/crypto-news/index.tsx:176-184` — Actualmente `<a href={url} target="_blank">` que abre en nueva pestaña
2. El usuario quiere overlay oscuro con imagen centrada a tamaño completo

## Decisions

1. **Sin dependencias externas** — modal hecho con React puro + Tailwind
2. **Estado**: `lightboxUrl: string | null` en el componente padre
3. **Cerrar**: click fuera de la imagen o tecla Escape
4. **Navegación**: si hay múltiples imágenes, flechas izquierda/derecha para navegar entre ellas
