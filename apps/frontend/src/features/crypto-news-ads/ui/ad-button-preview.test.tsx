// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { AdButtonPreview } from './ad-button-preview';
import type { AdButton } from '../api/ads-api';

afterEach(cleanup);

describe('AdButtonPreview', () => {
  it('renders nothing when no buttons are configured', () => {
    const { container } = render(<AdButtonPreview buttons={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a "Buttons (N)" label and one link per button', () => {
    const buttons: AdButton[] = [
      { text: 'One', url: 'https://example.com/1' },
      { text: 'Two', url: 'https://example.com/2' },
    ];
    const { container, getByText } = render(
      <AdButtonPreview buttons={buttons} />,
    );
    getByText('Buttons (2)');
    const anchors = container.querySelectorAll('a');
    expect(anchors).toHaveLength(2);
    expect(anchors[0].textContent).toBe('One');
    expect(anchors[0].getAttribute('href')).toBe('https://example.com/1');
  });

  it('renders every received button — the preview itself has no cap', () => {
    const buttons: AdButton[] = Array.from({ length: 8 }, (_, i) => ({
      text: `L${i}`,
      url: `https://example.com/${i}`,
    }));
    const { container, getByText } = render(
      <AdButtonPreview buttons={buttons} />,
    );
    getByText('Buttons (8)');
    expect(container.querySelectorAll('a')).toHaveLength(8);
  });

  it('renders duplicate URLs as separate buttons (keyed by index)', () => {
    const buttons: AdButton[] = [
      { text: 'A', url: 'https://example.com/x' },
      { text: 'B', url: 'https://example.com/x' },
    ];
    const { container } = render(<AdButtonPreview buttons={buttons} />);
    expect(container.querySelectorAll('a')).toHaveLength(2);
  });
});
