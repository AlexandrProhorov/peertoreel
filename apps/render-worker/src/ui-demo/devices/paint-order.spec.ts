import { describe, expect, it } from 'vitest';
import { paintOrder } from './paint-order.js';

/**
 * Layering is structural: background first, text last, author order kept inside
 * a rank.
 */
describe('paint order', () => {
  it('keeps text above a grid listed after it', () => {
    const ordered = paintOrder([
      { id: 'note', primitive: 'label' },
      { id: 'spread', primitive: 'grid' },
      { id: 'bg', primitive: 'stage' },
    ]);

    expect(ordered.map((element) => element.id)).toEqual(['bg', 'spread', 'note']);
  });

  it('keeps a card above the grid and below the text', () => {
    const ordered = paintOrder([
      { id: 'label', primitive: 'label' },
      { id: 'card', primitive: 'card' },
      { id: 'grid', primitive: 'grid' },
    ]);

    expect(ordered.map((element) => element.id)).toEqual(['grid', 'card', 'label']);
  });

  it('preserves the author order inside a rank', () => {
    const ordered = paintOrder([
      { id: 'chip-b', primitive: 'pill' },
      { id: 'chip-a', primitive: 'pill' },
    ]);

    expect(ordered.map((element) => element.id)).toEqual(['chip-b', 'chip-a']);
  });
});
