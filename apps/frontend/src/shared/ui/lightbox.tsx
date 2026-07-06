import { useCallback, useEffect, useState } from 'react';

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
