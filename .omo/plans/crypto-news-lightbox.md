# crypto-news-lightbox - Work Plan

## TL;DR (For humans)

**What you'll get:** Al hacer clic en una imagen, la pantalla se oscurece y la imagen se ve grande en el centro. Click fuera o Escape la cierra. Si hay varias imágenes, se puede navegar entre ellas con flechas.

**Why this approach:** React puro + Tailwind, sin librerías externas. Un estado `lightboxUrl` controla qué imagen mostrar. Un componente `Lightbox` renderiza el overlay con posición fija.

**Effort:** Short (~50 líneas, 1 archivo + 1 nuevo componente)
**Risk:** Low

## Todos

- [ ] 1. Crear componente Lightbox y reemplazar `<a target="_blank">`
     What to do:
  - **Nuevo archivo:** `apps/frontend/src/shared/ui/lightbox.tsx`

    ```tsx
    import { useCallback, useEffect } from 'react';

    interface LightboxProps {
      images: ReadonlyArray<{ id: string; url: string; alt: string }>;
      initialIndex: number;
      onClose: () => void;
    }

    export function Lightbox({ images, initialIndex, onClose }: LightboxProps) {
      const [index, setIndex] = useState(initialIndex);
      const current = images[index];

      const close = useCallback(() => onClose(), [onClose]);
      const prev = useCallback(
        () => setIndex((i) => (i > 0 ? i - 1 : images.length - 1)),
        [images.length],
      );
      const next = useCallback(
        () => setIndex((i) => (i < images.length - 1 ? i + 1 : 0)),
        [images.length],
      );

      useEffect(() => {
        const handler = (e: KeyboardEvent) => {
          if (e.key === 'Escape') close();
          if (e.key === 'ArrowLeft') prev();
          if (e.key === 'ArrowRight') next();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
      }, [close, prev, next]);

      if (!current) return null;

      return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={close}
        >
          {/* Imagen */}
          <img
            src={current.url}
            alt={current.alt}
            className="max-h-[90vh] max-w-[90vw] rounded object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {/* Botón cerrar */}
          <button
            onClick={close}
            className="absolute top-4 right-4 text-white text-2xl opacity-70 hover:opacity-100"
            aria-label="Close"
          >
            ✕
          </button>
          {/* Flecha izquierda */}
          {images.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl opacity-70 hover:opacity-100"
              aria-label="Previous"
            >
              ‹
            </button>
          )}
          {/* Flecha derecha */}
          {images.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl opacity-70 hover:opacity-100"
              aria-label="Next"
            >
              ›
            </button>
          )}
          {/* Contador */}
          {images.length > 1 && (
            <div className="absolute bottom-4 text-white text-sm opacity-70">
              {index + 1} / {images.length}
            </div>
          )}
        </div>
      );
    }
    ```

    Importar `useState` de React.

  - **Modificar** `apps/frontend/src/pages/crypto-news/index.tsx`:
    - Import: `import { Lightbox } from '@/shared/ui/lightbox';`
    - Estado: `const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);`
    - Reemplazar el `<a href={url} target="_blank">` que envuelve cada `<img>` por:
      ```tsx
      <button
        key={m.id}
        onClick={() => setLightboxIndex(i)}
        className="block w-full text-left"
      >
        <img ... className="... cursor-pointer ..." />
      </button>
      ```
    - Antes del cierre del `</Card>` (o antes del `</div>`) añadir:
      ```tsx
      {
        lightboxIndex !== null && (
          <Lightbox
            images={msg.media.map((m, i) => ({
              id: m.id,
              url: m.url,
              alt: `${msg.title ?? 'image'} ${i + 1}`,
            }))}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        );
      }
      ```
    - NOTA: el Lightbox debe renderizarse dentro del article o al nivel del page. Lo más limpio: renderizarlo al final del `return` del `CryptoNewsPage` para que el overlay cubra toda la página.
    - Mover el estado `lightboxIndex` al componente `CryptoNewsPage`, no dentro del IIFE de grouping.
  - NO mantener el `<a target="_blank">` — reemplazar completamente por `<button>` con `onClick`
  - NO modificar el layout de imágenes/texto existente

## Verification

- Click en imagen → overlay oscuro con imagen grande centrada
- Flechas izquierda/derecha navegan entre imágenes del mismo post
- Escape o click fuera cierra el lightbox
- 8 tests existentes pasan

## Commits

1. `feat(frontend): add image lightbox to crypto-news`
