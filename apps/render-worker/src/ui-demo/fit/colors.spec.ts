import { describe, expect, it } from 'vitest';
import { themeById } from '../themes.js';
import { snapThemeColors } from './colors.js';
import type { Repair } from './salvage.js';

/**
 * Colour is a theme decision: a role name is resolved, a palette hex is kept, a
 * foreign hex is snapped to the nearest palette colour, and a name that is
 * neither is dropped. Every change leaves a repair record.
 */

const theme = themeById('studio-lime');

function element(params: Record<string, unknown>, primitive = 'card'): unknown {
  return {
    id: 'surface',
    primitive,
    layout: { x: 0, y: 0, width: 100, height: 100 },
    params,
  };
}

function snap(params: Record<string, unknown>, primitive = 'card'): {
  params: Record<string, unknown>;
  repairs: Repair[];
} {
  const repairs: Repair[] = [];
  const [result] = snapThemeColors(
    [element(params, primitive) as Record<string, unknown>],
    theme,
    repairs,
  );

  return {
    params: (result as { params: Record<string, unknown> }).params,
    repairs,
  };
}

describe('theme colours', () => {
  it('resolves a role name to the palette', () => {
    const { params, repairs } = snap({ background: 'accent' });

    expect(params['background']).toBe(theme.accent);
    expect(repairs[0]).toMatchObject({
      path: 'card.background',
      reason: 'role accent',
      from: 'accent',
      to: theme.accent,
    });
  });

  it('keeps a palette hex as it is', () => {
    const { params, repairs } = snap({ background: theme.surface });

    expect(params['background']).toBe(theme.surface);
    expect(repairs).toHaveLength(0);
  });

  it('snaps a foreign hex to the nearest theme colour', () => {
    const { params, repairs } = snap({ background: '#CFFE01' });

    expect(params['background']).toBe(theme.accent);
    expect(repairs[0]?.reason).toBe(`not from the theme, nearest is ${theme.accent}`);
  });

  it('drops a name that is neither a role nor a hex', () => {
    const { params, repairs } = snap({ background: 'forest' });

    expect(params['background']).toBeUndefined();
    expect(repairs[0]).toMatchObject({ reason: 'not a colour role and not a hex' });
  });

  it('leaves parameters that are not colours alone', () => {
    const { params, repairs } = snap({ radius: 'forest' });

    expect(params['radius']).toBe('forest');
    expect(repairs).toHaveLength(0);
  });

  it('resolves the ink of a text primitive the same way', () => {
    const { params } = snap({ text: 'Скидка', textColor: 'muted' }, 'label');

    expect(params['textColor']).toBe(theme.muted);
  });
});
