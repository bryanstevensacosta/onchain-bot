import { PlaygroundForm } from '@/features/prompt-playground';

export function PlaygroundPage(): React.ReactElement {
  return (
    <div className="px-6 py-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100">Playground</h1>
          <p className="text-sm text-slate-400 mt-1">
            Prueba borradores de prompts con muestras reales: edita,
            previsualiza el render, genera una salida de prueba y guarda como
            plantilla.
          </p>
        </div>
        {import.meta.env.VITE_APP_ENV && (
          <span className="text-xs font-mono text-slate-500 border border-slate-800 rounded px-2 py-1">
            {import.meta.env.VITE_APP_ENV}
          </span>
        )}
      </header>

      <aside className="space-y-4">
        <details
          open
          className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/30 p-4"
        >
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200 select-none">
            Editor y prueba
          </summary>
          <div className="pt-2">
            <PlaygroundForm />
          </div>
        </details>

        <details className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/30 p-4">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200 select-none">
            Ayuda
          </summary>
          <div className="pt-2 space-y-2 text-sm text-slate-400">
            <p>
              Cada ejecución con «Generar con LLM» consume 1 llamada al modelo.
              El render del user prompt no consume llamadas.
            </p>
            <p>
              Placeholders disponibles en la plantilla:{' '}
              <code className="font-mono text-slate-300">{'{{title}}'}</code>,{' '}
              <code className="font-mono text-slate-300">{'{{original}}'}</code>
              ,{' '}
              <code className="font-mono text-slate-300">{'{{hasImage}}'}</code>
              .
            </p>
            <p>
              Guardar crea siempre una plantilla nueva — nunca sobrescribe la
              plantilla{' '}
              <code className="font-mono text-slate-300">Default</code>. Esta
              página no publica nada.
            </p>
          </div>
        </details>
      </aside>
    </div>
  );
}
