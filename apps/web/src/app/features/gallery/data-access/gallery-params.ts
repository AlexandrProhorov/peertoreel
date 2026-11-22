import type { GalleryParameter, GalleryValue } from './gallery-catalog';

/**
 * Settings come from DOM controls, so every value is re-checked against the
 * contract before it reaches the preview: a number stays inside its range, an
 * enum stays one of its values, text is cut to its declared length.
 */
export function coerceParam(
  parameter: GalleryParameter,
  value: GalleryValue,
): GalleryValue {
  switch (parameter.type) {
    case 'number': {
      const parsed = typeof value === 'number' ? value : Number(value);

      if (!Number.isFinite(parsed)) {
        return parameter.initial;
      }

      const min = parameter.min ?? parsed;
      const max = parameter.max ?? parsed;

      return Math.min(max, Math.max(min, parsed));
    }
    case 'boolean':
      return value === true;
    case 'enum':
      return (parameter.values ?? []).includes(value as string | number)
        ? value
        : parameter.initial;
    case 'string':
    case 'color': {
      const text = typeof value === 'string' ? value : String(value);

      return parameter.maxLength === undefined
        ? text
        : text.slice(0, parameter.maxLength);
    }
    case 'asset':
      return typeof value === 'string' ? value : parameter.initial;
  }
}

/** The value a control shows: numbers as numbers, the rest as text. */
export function displayValue(value: GalleryValue): string {
  return String(value);
}

/**
 * A `<select>` returns a string even when the contract declares numbers
 * (`weight: 400`). Map it back to the declared value instead of sending "400".
 */
export function enumFromInput(
  parameter: GalleryParameter,
  raw: string,
): GalleryValue {
  return parameter.values?.find((value) => String(value) === raw) ?? raw;
}
