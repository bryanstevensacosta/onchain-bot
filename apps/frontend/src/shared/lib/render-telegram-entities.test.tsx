// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderFormattedText } from './render-telegram-entities';

describe('renderFormattedText — out-of-range entity offset (regression)', () => {
  it('a) exact regression: does not duplicate text when an entity points past content', () => {
    const content = 'Ethe';
    const entities = [
      { offset: 0, length: 4, type: 'bold' },
      { offset: 100, length: 4, type: 'bold' },
    ];

    render(<>{renderFormattedText(content, entities)}</>);

    const text = screen.getByText('Ethe');
    expect(text.textContent).toBe('Ethe');
    expect(text.textContent).not.toBe('EtheEthe');
  });

  it('b) at-scale regression (msg 17863): no duplicate tail when content is sliced to ~500 chars', () => {
    const truncated = 'X'.repeat(480) + 'TAIL_UNIQUE_20CHARS!';
    const entities = [
      { offset: 0, length: 4, type: 'bold' },
      { offset: 500, length: 4, type: 'bold' },
      { offset: 1000, length: 4, type: 'bold' },
      { offset: 1500, length: 4, type: 'bold' },
      { offset: 1650, length: 4, type: 'bold' },
    ];

    const { container } = render(
      <>{renderFormattedText(truncated, entities)}</>,
    );

    const rendered = container.textContent ?? '';
    expect(rendered).toBe(truncated);
    expect(rendered.match(/TAIL_UNIQUE_20CHARS!/g)?.length ?? 0).toBe(1);
    expect(rendered.length).toBe(truncated.length);
  });
});

describe('renderFormattedText — in-range clamping and boundary handling', () => {
  it('c) in-range entity clamps at the truncation boundary', () => {
    const content = 'x'.repeat(500);
    const entities = [{ offset: 480, length: 30, type: 'bold' }];

    const { container } = render(<>{renderFormattedText(content, entities)}</>);

    const bold = container.querySelector('strong');
    expect(bold).not.toBeNull();
    expect(bold?.textContent).toBe('x'.repeat(20));
    expect(container.textContent).toBe(content);
  });

  it('d) entity touching the boundary (offset === content.length) is out-of-range', () => {
    const content = 'hello';
    const entities = [{ offset: 5, length: 3, type: 'bold' }];

    const { container } = render(<>{renderFormattedText(content, entities)}</>);

    expect(container.textContent).toBe('hello');
    expect(container.textContent).not.toBe('hellohello');
    expect(container.querySelector('strong')).toBeNull();
  });

  it('e) degenerate entity {offset: 0, length: 0} is skipped without crashing', () => {
    const content = 'hello';
    const entities = [{ offset: 0, length: 0, type: 'bold' }];

    const { container } = render(<>{renderFormattedText(content, entities)}</>);

    expect(container.textContent).toBe('hello');
    expect(container.querySelector('strong')).toBeNull();
  });

  it('f) same-offset nested entities do not duplicate the segment', () => {
    const content = 'abcdefghijklmnopqrstuvwxyz';
    const entities = [
      { offset: 10, length: 5, type: 'bold' },
      { offset: 10, length: 5, type: 'italic' },
    ];

    const { container } = render(<>{renderFormattedText(content, entities)}</>);

    const text = container.textContent ?? '';
    expect(text).toBe(content);
    expect(text.match(/klmno/g)?.length ?? 0).toBe(1);
  });
});

describe('renderFormattedText — empty / nullish entities', () => {
  it('g1) entities = undefined renders plain text unchanged', () => {
    const content = 'plain text';
    const { container } = render(
      <>{renderFormattedText(content, undefined)}</>,
    );
    expect(container.textContent).toBe('plain text');
  });

  it('g2) entities = [] renders plain text unchanged', () => {
    const content = 'plain text';
    const { container } = render(<>{renderFormattedText(content, [])}</>);
    expect(container.textContent).toBe('plain text');
  });

  it('g3) entities = null renders plain text unchanged', () => {
    const content = 'plain text';
    const { container } = render(<>{renderFormattedText(content, null)}</>);
    expect(container.textContent).toBe('plain text');
  });

  it('h) no entities argument at all renders plain text unchanged', () => {
    const content = 'just words';
    const { container } = render(<>{renderFormattedText(content)}</>);
    expect(container.textContent).toBe('just words');
  });
});
