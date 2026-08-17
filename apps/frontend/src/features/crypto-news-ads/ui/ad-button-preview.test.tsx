// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { AdButtonPreview, extractAdAnchors } from './ad-button-preview';

afterEach(cleanup);

describe('extractAdAnchors', () => {
  it('returns N entries for N anchors with correct label and url', () => {
    const body =
      '<a href="https://example.com/a">Alpha</a> text <a href="https://example.com/b">Beta</a>';
    const anchors = extractAdAnchors(body);
    expect(anchors).toHaveLength(2);
    expect(anchors[0]).toEqual({
      label: 'Alpha',
      url: 'https://example.com/a',
    });
    expect(anchors[1]).toEqual({
      label: 'Beta',
      url: 'https://example.com/b',
    });
  });

  it('falls back to "Abrir" when the anchor text is empty or whitespace', () => {
    expect(extractAdAnchors('<a href="https://example.com/x">  </a>')).toEqual([
      { label: 'Abrir', url: 'https://example.com/x' },
    ]);
  });
});

describe('AdButtonPreview', () => {
  it('renders nothing when the body has no anchor', () => {
    const { container } = render(
      <AdButtonPreview body="Just plain text, no links" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a "Buttons (N)" label and one button per anchor', () => {
    const { container, getByText } = render(
      <AdButtonPreview
        body={
          '<a href="https://example.com/1">One</a> and ' +
          '<a href="https://example.com/2">Two</a>'
        }
      />,
    );
    getByText('Buttons (2)');
    const buttons = container.querySelectorAll('a');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toBe('One');
    expect(buttons[0].getAttribute('href')).toBe('https://example.com/1');
  });

  it('caps the rendered buttons at 6 even when the body has 8 anchors', () => {
    const body = Array.from(
      { length: 8 },
      (_, i) => `<a href="https://example.com/${i}">L${i}</a>`,
    ).join(' ');
    const { container, getByText } = render(<AdButtonPreview body={body} />);
    getByText('Buttons (6)');
    expect(container.querySelectorAll('a')).toHaveLength(6);
  });
});
