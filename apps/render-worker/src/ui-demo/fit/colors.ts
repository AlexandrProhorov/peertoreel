import { PRIMITIVES, type PrimitiveId } from '../catalog.js';
import { resolveThemeColor, type UiTheme } from '../themes.js';
import type { Repair } from './salvage.js';

/**
 * Colour belongs to the theme.
 *
 * A model may name a colour by role (`accent`, `surface`, `ink`) or repeat a hex
 * it saw in the theme; either way the value is replaced by the palette hex
 * before the quality gate runs. A foreign hex is snapped to the nearest theme
 * colour and a name that is neither a role nor a hex is dropped — both with a
 * repair record. The gate then always compares palette colours, so a contrast
 * failure means the composition is wrong, not that the model invented a colour.
 */

type Unknown = Record<string, unknown>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isColorParameter(primitive: PrimitiveId, key: string): boolean {
  return PRIMITIVES[primitive].parameters[key]?.type === 'color';
}

function snapElement(element: Unknown, theme: UiTheme, repairs: Repair[]): Unknown {
  if (!isObject(element) || typeof element['primitive'] !== 'string') {
    return element;
  }

  const primitive = element['primitive'];

  if (!Object.hasOwn(PRIMITIVES, primitive)) {
    return element;
  }

  const params = element['params'];

  if (!isObject(params)) {
    return element;
  }

  const id = typeof element['id'] === 'string' ? element['id'] : null;
  const next: Record<string, unknown> = { ...params };

  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== 'string' || !isColorParameter(primitive as PrimitiveId, key)) {
      continue;
    }

    const resolved = resolveThemeColor(theme, value);

    if (resolved === null) {
      delete next[key];
      repairs.push({
        element: id,
        path: `${primitive}.${key}`,
        reason: 'not a colour role and not a hex',
        from: value,
        to: '(removed, theme applies)',
      });
      continue;
    }

    if (resolved.note !== null) {
      repairs.push({
        element: id,
        path: `${primitive}.${key}`,
        reason: resolved.note,
        from: value,
        to: resolved.hex,
      });
    }

    next[key] = resolved.hex;
  }

  return { ...element, params: next };
}

export function snapThemeColors(
  elements: readonly Unknown[],
  theme: UiTheme,
  repairs: Repair[],
): Unknown[] {
  return elements.map((element) => snapElement(element, theme, repairs));
}
