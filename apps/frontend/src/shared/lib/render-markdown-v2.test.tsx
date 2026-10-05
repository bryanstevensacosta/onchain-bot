// @vitest-environment jsdom
import '@/test/setup';

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { parseMarkdownV2, RenderMarkdownV2 } from './render-markdown-v2';

// Real seed bodies from
// `apps/dexter-onchain-bot/src/templates/infrastructure/seed/message-template-seed.service.ts`.
const FULL_DEXTER_BODY = [
  '{{chainDisplay}} ${{symbol}} | {{name}} — {{chain}}',
  '`{{address}}`',
  '',
  '💰 {{priceUsd}} ({{priceChange24h}}) • MC {{marketCapUsd}} • Liq {{liquidityUsd}}',
  '📦 FDV {{fdvUsd}} • Total {{totalSupply}} • Circulating {{circulatingSupply}} • Max {{maxSupply}}',
  '👥 Holders {{holders}} • Top 10 {{top10HolderPercent}} • {{devLine}}',
  '🔗 {{scanLinks}}',
  '🤖 {{tradeHint}}',
].join('\n');

const Z_COMPACT_BODY = [
  '${{symbol}} | {{name}}',
  '💰 {{priceUsd}} ({{priceChange24h}}) • MC {{marketCapUsd}}',
].join('\n');

const CHART_BODY = [
  '📈 Chart ({{timeframe}}): {{dexscreenerUrl}}',
  '🔗 {{scanLinks}}',
].join('\n');

function renderBody(body: string) {
  return render(<RenderMarkdownV2 body={body} />);
}

afterEach(() => {
  cleanup();
});

describe('parseMarkdownV2', () => {
  it('renders bold/italic/strike as elements', () => {
    const { container } = renderBody('*hola* _mundo_ ~tachado~');
    expect(container.querySelector('strong')).toHaveTextContent('hola');
    expect(container.querySelector('em')).toHaveTextContent('mundo');
    expect(container.querySelector('s')).toHaveTextContent('tachado');
  });

  it('renders inline code and fenced pre as elements', () => {
    const { container } = renderBody('`abc123` y ```bloque```');
    expect(container.querySelector('code')).toHaveTextContent('abc123');
    expect(container.querySelector('pre')).toHaveTextContent('bloque');
  });

  it('renders links with http(s) hrefs', () => {
    const { container } = renderBody('[dex](https://dexscreener.com/solana/x)');
    const link = container.querySelector('a');
    expect(link).toHaveTextContent('dex');
    expect(link?.getAttribute('href')).toBe('https://dexscreener.com/solana/x');
  });

  it('renders escaped markers literally', () => {
    renderBody('\\*literal\\* \\_guion\\_ \\~tach\\~ \\[corchete\\]');
    const root = screen.getByTestId('dexter-markdown-render');
    expect(root).toHaveTextContent('*literal* _guion_ ~tach~ [corchete]');
    expect(root.querySelector('strong')).toBeNull();
    expect(root.querySelector('em')).toBeNull();
  });

  it('degrades incomplete markup to plain text (never crashes)', () => {
    const { container } = renderBody('*sin cerrar y _otro sin cerrar');
    expect(container.textContent).toBe('*sin cerrar y _otro sin cerrar');
    expect(container.querySelector('strong')).toBeNull();
    expect(container.querySelector('em')).toBeNull();
  });

  it('degrades unclosed code/pre/link to plain text', () => {
    const code = renderBody('precio `sin cerrar').container;
    expect(code.textContent).toContain('`sin cerrar');
    expect(code.querySelector('code')).toBeNull();

    const pre = renderBody('bloque ```tampoco').container;
    expect(pre.textContent).toContain('```tampoco');
    expect(pre.querySelector('pre')).toBeNull();

    const link = renderBody('mira [ni enlace').container;
    expect(link.textContent).toContain('[ni enlace');
    expect(link.querySelector('a')).toBeNull();
  });

  it('drops javascript: hrefs and keeps the label as text', () => {
    const { container } = renderBody('[click](javascript:alert(1))');
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('[click](javascript:alert(1))');
  });

  it('renders attack HTML as plain text (XSS-safe, no raw HTML)', () => {
    const { container } = renderBody('<img src=x onerror=alert(1)> *negrita*');
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.querySelector('strong')).toHaveTextContent('negrita');
  });

  it('pins the full-dexter seed body render', () => {
    const { container } = renderBody(FULL_DEXTER_BODY);
    // Placeholders travel as literal text; the address span is code.
    expect(container.textContent).toContain('{{chainDisplay}}');
    expect(container.textContent).toContain('${{symbol}}');
    expect(container.textContent).toContain('{{marketCapUsd}}');
    expect(container.textContent).toContain('{{tradeHint}}');
    expect(container.querySelector('code')).toHaveTextContent('{{address}}');
  });

  it('pins the z-compact seed body render', () => {
    const { container } = renderBody(Z_COMPACT_BODY);
    expect(container.textContent).toContain('${{symbol}} | {{name}}');
    expect(container.textContent).toContain('{{priceUsd}}');
  });

  it('pins the chart seed body render', () => {
    const { container } = renderBody(CHART_BODY);
    expect(container.textContent).toContain('({{timeframe}})');
    expect(container.textContent).toContain('{{dexscreenerUrl}}');
  });

  it('parseMarkdownV2 returns nodes without crashing on empty input', () => {
    expect(parseMarkdownV2('')).toEqual([]);
    expect(parseMarkdownV2('texto plano')).toEqual(['texto plano']);
  });
});
