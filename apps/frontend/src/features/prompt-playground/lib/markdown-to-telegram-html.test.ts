import { describe, expect, it } from 'vitest';
import { markdownToTelegramHtml } from './markdown-to-telegram-html';

describe('markdownToTelegramHtml', () => {
  it('convierte bold, italic, strike y code', () => {
    expect(markdownToTelegramHtml('**hola** y *mundo*')).toBe(
      '<b>hola</b> y <i>mundo</i>',
    );
    expect(markdownToTelegramHtml('__fuerte__ y ~~tachado~~')).toBe(
      '<b>fuerte</b> y <s>tachado</s>',
    );
    expect(markdownToTelegramHtml('usa `code` aquí')).toBe(
      'usa <code>code</code> aquí',
    );
  });

  it('convierte enlaces, encabezados y bullets', () => {
    expect(markdownToTelegramHtml('[CoinDesk](https://example.com/x)')).toBe(
      '<a href="https://example.com/x">CoinDesk</a>',
    );
    expect(markdownToTelegramHtml('# Titular')).toBe('<b>Titular</b>');
    expect(markdownToTelegramHtml('- punto uno')).toBe('• punto uno');
  });

  it('no toca guiones bajos dentro de palabras ni HTML existente', () => {
    expect(markdownToTelegramHtml('snake_case intacto')).toBe(
      'snake_case intacto',
    );
    expect(markdownToTelegramHtml('<b>ya es html</b>')).toBe(
      '<b>ya es html</b>',
    );
  });

  it('convierte fences a pre sin tocar el interior', () => {
    expect(markdownToTelegramHtml('```\n**no**\n```')).toBe(
      '<pre>**no**</pre>',
    );
  });

  it('convierte citas > y agrupa líneas consecutivas', () => {
    expect(
      markdownToTelegramHtml(
        '> “Si no resuelve sus inquietudes, no lo apoyen.” — Thom Tillis.',
      ),
    ).toBe(
      '<blockquote>“Si no resuelve sus inquietudes, no lo apoyen.” — Thom Tillis.</blockquote>',
    );
    expect(markdownToTelegramHtml('> línea uno\n> línea dos')).toBe(
      '<blockquote>línea uno\nlínea dos</blockquote>',
    );
  });
});
