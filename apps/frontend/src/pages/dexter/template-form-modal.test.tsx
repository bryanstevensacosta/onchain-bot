// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import templatesSectionSrc from './templates-section.tsx?raw';
import liveEditorSrc from './live-editor-section.tsx?raw';
import templateFormModalSrc from './template-form-modal.tsx?raw';

vi.mock('@/entities/dexter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/dexter')>();
  return {
    ...actual,
    useCreateTemplate: vi.fn(),
    useUpdateTemplate: vi.fn(),
  };
});

import * as dexter from '@/entities/dexter';
import { TemplateFormModal } from './template-form-modal';

function idleMutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
    data: undefined,
    ...overrides,
  };
}

const TPL = {
  id: 'tpl-1',
  command: 'ca',
  name: 'full-dexter-v1',
  bodyMarkdown: '*{{symbol}}* | {{name}}',
  isActive: true,
  version: 3,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function mockMutations() {
  vi.mocked(dexter.useCreateTemplate).mockReturnValue(
    idleMutation() as unknown as ReturnType<typeof dexter.useCreateTemplate>,
  );
  vi.mocked(dexter.useUpdateTemplate).mockReturnValue(
    idleMutation() as unknown as ReturnType<typeof dexter.useUpdateTemplate>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TemplateFormModal (shared CRUD form)', () => {
  it('creates with command + name + body through useCreateTemplate', () => {
    mockMutations();
    render(
      <TemplateFormModal
        mode={{ kind: 'create' }}
        command="ca"
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId('dexter-template-form-name'), {
      target: { value: 'fresh-v1' },
    });
    fireEvent.change(screen.getByTestId('dexter-template-form-body'), {
      target: { value: 'hello {{symbol}}' },
    });
    fireEvent.click(screen.getByTestId('dexter-template-form-submit'));
    expect(
      vi.mocked(dexter.useCreateTemplate).mock.results[0]?.value.mutate,
    ).toHaveBeenCalledWith(
      { command: 'ca', name: 'fresh-v1', bodyMarkdown: 'hello {{symbol}}' },
      expect.anything(),
    );
  });

  it('edits name + body through useUpdateTemplate (no command field)', () => {
    mockMutations();
    render(
      <TemplateFormModal
        mode={{ kind: 'edit', template: TPL }}
        command="ca"
        onClose={() => {}}
      />,
    );
    expect(
      (screen.getByTestId('dexter-template-form-name') as HTMLInputElement)
        .value,
    ).toBe('full-dexter-v1');
    expect(
      screen.queryByTestId('dexter-template-form-command'),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('dexter-template-form-body'), {
      target: { value: 'edited {{symbol}}' },
    });
    fireEvent.click(screen.getByTestId('dexter-template-form-submit'));
    expect(
      vi.mocked(dexter.useUpdateTemplate).mock.results[0]?.value.mutate,
    ).toHaveBeenCalledWith(
      {
        id: 'tpl-1',
        body: { name: 'full-dexter-v1', bodyMarkdown: 'edited {{symbol}}' },
      },
      expect.anything(),
    );
  });
});

describe('dexter save flow shares one CRUD implementation (no duplication)', () => {
  it('TemplatesSection renders the shared TemplateFormModal', () => {
    expect(templatesSectionSrc).toContain("from './template-form-modal'");
    expect(templatesSectionSrc).toContain('<TemplateFormModal');
    expect(templatesSectionSrc).not.toMatch(/function TemplateFormModal/);
  });

  it('TemplatesSection holds no template mutations of its own', () => {
    expect(templatesSectionSrc).not.toContain('useCreateTemplate');
    expect(templatesSectionSrc).not.toContain('useUpdateTemplate');
  });

  it('the live editor reuses the shared hooks, never raw fetchers', () => {
    expect(liveEditorSrc).toContain('useCreateTemplate');
    expect(liveEditorSrc).toContain('useUpdateTemplate');
    expect(liveEditorSrc).not.toContain('httpPost');
    expect(liveEditorSrc).not.toContain('httpPatch');
    expect(liveEditorSrc).not.toContain('createDexterTemplate');
    expect(liveEditorSrc).not.toContain('updateDexterTemplate');
    expect(liveEditorSrc).not.toMatch(/function TemplateFormModal/);
  });

  it('the shared modal owns the single form implementation', () => {
    expect(templateFormModalSrc).toContain('useCreateTemplate');
    expect(templateFormModalSrc).toContain('useUpdateTemplate');
    expect(templateFormModalSrc).toContain('dexter-template-form-submit');
  });
});
