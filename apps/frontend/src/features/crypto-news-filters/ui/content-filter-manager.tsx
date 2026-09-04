import { useState } from 'react';
import {
  useFilters,
  useCreateFilter,
  useUpdateFilter,
  useDeleteFilter,
  useToggleFilter,
  type ContentFilter,
} from '@/entities/crypto-news';
import { Button, Card } from '@/shared/ui';

interface ContentFilterManagerProps {
  channelId: string;
}

interface FilterFormData {
  pattern: string;
  replacement: string;
  flags: string;
  priority: number;
  isActive: boolean;
}

const INITIAL_FORM_DATA: FilterFormData = {
  pattern: '',
  replacement: '',
  flags: 'gi',
  priority: 0,
  isActive: true,
};

export function ContentFilterManager({ channelId }: ContentFilterManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FilterFormData>(INITIAL_FORM_DATA);
  const [previewInput, setPreviewInput] = useState('');

  const { data: filters, isLoading } = useFilters(channelId);
  const createMutation = useCreateFilter();
  const updateMutation = useUpdateFilter();
  const deleteMutation = useDeleteFilter();
  const toggleMutation = useToggleFilter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingId) {
      // Update existing filter
      await updateMutation.mutateAsync({
        id: editingId,
        dto: formData,
      });
      setEditingId(null);
    } else {
      // Create new filter
      await createMutation.mutateAsync({
        channelId,
        ...formData,
      });
      setIsAdding(false);
    }

    setFormData(INITIAL_FORM_DATA);
    setPreviewInput('');
  };

  const handleEdit = (filter: ContentFilter) => {
    setEditingId(filter.id);
    setFormData({
      pattern: filter.pattern,
      replacement: filter.replacement,
      flags: filter.flags,
      priority: filter.priority,
      isActive: filter.isActive,
    });
    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar este filtro?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleToggle = async (id: string) => {
    await toggleMutation.mutateAsync(id);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData(INITIAL_FORM_DATA);
    setPreviewInput('');
  };

  const getPreview = (): string => {
    if (!previewInput || !formData.pattern) return previewInput;

    try {
      const regex = new RegExp(formData.pattern, formData.flags);
      return previewInput.replace(regex, formData.replacement);
    } catch {
      return '[Invalid regex pattern]';
    }
  };

  if (isLoading) {
    return <div className="text-slate-400">Cargando filtros...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100">
          Filtros de Contenido
        </h3>
        {!isAdding && (
          <Button
            onClick={() => setIsAdding(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            + Agregar Filtro
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="bg-slate-800 border-slate-700 p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-sm font-medium text-slate-100 mb-2">
              {editingId ? 'Editar Filtro' : 'Nuevo Filtro'}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Patrón (regex)
              </label>
              <input
                type="text"
                value={formData.pattern}
                onChange={(e) =>
                  setFormData({ ...formData, pattern: e.target.value })
                }
                placeholder="News \| Markets \| YouTube\s*\n?"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-slate-100 text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Reemplazo
              </label>
              <input
                type="text"
                value={formData.replacement}
                onChange={(e) =>
                  setFormData({ ...formData, replacement: e.target.value })
                }
                placeholder="(vacío para eliminar)"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-slate-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Flags
                </label>
                <input
                  type="text"
                  value={formData.flags}
                  onChange={(e) =>
                    setFormData({ ...formData, flags: e.target.value })
                  }
                  placeholder="gi"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-slate-100 text-sm focus:outline-none focus:border-blue-500"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">
                  g=global, i=case-insensitive, m=multiline
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Prioridad
                </label>
                <input
                  type="number"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      priority: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-slate-100 text-sm focus:outline-none focus:border-blue-500"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">
                  Menor = mayor precedencia
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                className="rounded bg-slate-900 border-slate-600"
              />
              <label htmlFor="isActive" className="text-sm text-slate-300">
                Filtro activo
              </label>
            </div>

            {/* Preview Section */}
            <div className="border-t border-slate-700 pt-4">
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Vista previa
              </label>
              <textarea
                value={previewInput}
                onChange={(e) => setPreviewInput(e.target.value)}
                placeholder="Ingresa texto para ver cómo se aplica el filtro..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-slate-100 text-sm focus:outline-none focus:border-blue-500 font-mono"
                rows={3}
              />
              {previewInput && (
                <div className="mt-2 p-2 bg-slate-900 rounded border border-slate-600">
                  <div className="text-xs text-slate-500 mb-1">Resultado:</div>
                  <div className="text-sm text-slate-300 font-mono whitespace-pre-wrap">
                    {getPreview()}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {editingId ? 'Actualizar' : 'Crear'}
              </Button>
              <Button
                type="button"
                onClick={handleCancel}
                className="bg-slate-600 hover:bg-slate-700"
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Filters List */}
      <div className="space-y-2">
        {filters && filters.length === 0 && !isAdding && (
          <p className="text-sm text-slate-500 text-center py-4">
            No hay filtros configurados para este canal.
          </p>
        )}

        {filters?.map((filter) => (
          <Card
            key={filter.id}
            className={`bg-slate-800 border-slate-700 p-3 ${
              !filter.isActive ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      filter.isActive
                        ? 'bg-green-900/50 text-green-400'
                        : 'bg-slate-700 text-slate-500'
                    }`}
                  >
                    {filter.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                  <span className="text-xs text-slate-500">
                    Prioridad: {filter.priority}
                  </span>
                </div>
                <div className="text-sm text-slate-300 font-mono break-all">
                  <span className="text-slate-500">Pattern:</span> /
                  {filter.pattern}/{filter.flags}
                </div>
                {filter.replacement && (
                  <div className="text-sm text-slate-400 font-mono break-all mt-1">
                    <span className="text-slate-500">Replace:</span> &quot;
                    {filter.replacement}&quot;
                  </div>
                )}
              </div>

              <div className="flex gap-1">
                <button
                  onClick={() => handleToggle(filter.id)}
                  disabled={toggleMutation.isPending}
                  className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                  title={filter.isActive ? 'Desactivar' : 'Activar'}
                >
                  {filter.isActive ? '⏸' : '▶'}
                </button>
                <button
                  onClick={() => handleEdit(filter)}
                  className="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-slate-100 rounded transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(filter.id)}
                  disabled={deleteMutation.isPending}
                  className="px-2 py-1 text-xs bg-red-700 hover:bg-red-600 text-slate-100 rounded transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
