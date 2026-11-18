import { tokenForHeight } from '../typography-rules.js';
import { clampLayout } from './clamp.js';

/**
 * Normalisation before validation: the two things the model is bad at and code
 * is good at — clamping a box into the safe zone and picking the type size the
 * box implies. It works on the raw JSON because the strict schema rejects a
 * scene for exactly these two reasons.
 */

type Unknown = Record<string, unknown>;

function isObject(value: unknown): value is Unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeElement(element: Unknown): Unknown {
  const primitive = element['primitive'];
  const layout = element['layout'];

  if (typeof primitive !== 'string' || !isObject(layout) || primitive === 'stage') {
    return element;
  }

  const withLayout = clampLayout({
    layout: layout as { x: number; y: number; width?: number; height?: number },
  }) as { layout: Unknown };

  const params = isObject(element['params']) ? element['params'] : null;
  const token = params?.['token'];

  if (
    params === null ||
    typeof token !== 'string' ||
    !['label', 'pill', 'bubble'].includes(primitive)
  ) {
    return { ...element, layout: withLayout.layout };
  }

  const nextToken = tokenForHeight(token, withLayout.layout['height'] as number | undefined);

  return {
    ...element,
    layout: withLayout.layout,
    params: nextToken === token ? params : { ...params, token: nextToken },
  };
}

export function normalizeRawEpisode(raw: unknown): unknown {
  if (!isObject(raw) || !Array.isArray(raw['scenes'])) {
    return raw;
  }

  return {
    ...raw,
    scenes: raw['scenes'].map((scene) => {
      if (!isObject(scene) || !isObject(scene['spec'])) {
        return scene;
      }

      const spec = scene['spec'];
      const elements = spec['elements'];

      if (!Array.isArray(elements)) {
        return scene;
      }

      return {
        ...scene,
        spec: { ...spec, elements: elements.map(normalizeElement) },
      };
    }),
  };
}
