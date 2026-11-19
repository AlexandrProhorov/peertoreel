import type { GalleryParameter } from './gallery-catalog';
import { coerceParam, enumFromInput } from './gallery-params';

function parameter(
  overrides: Partial<GalleryParameter> & Pick<GalleryParameter, 'type'>,
): GalleryParameter {
  return { name: 'p', initial: 0, ...overrides };
}

describe('coerceParam', () => {
  it('clamps a number into the declared range', () => {
    const spec = parameter({ type: 'number', min: 0, max: 10, initial: 5 });

    expect(coerceParam(spec, 42)).toBe(10);
    expect(coerceParam(spec, -3)).toBe(0);
    expect(coerceParam(spec, '7')).toBe(7);
  });

  it('falls back to the initial value for a non-finite number', () => {
    const spec = parameter({ type: 'number', min: 0, max: 10, initial: 5 });

    expect(coerceParam(spec, Number.NaN)).toBe(5);
  });

  it('rejects a value outside the enum', () => {
    const spec = parameter({ type: 'enum', values: ['a', 'b'], initial: 'a' });

    expect(coerceParam(spec, 'c')).toBe('a');
    expect(coerceParam(spec, 'b')).toBe('b');
  });

  it('cuts text to the declared length', () => {
    const spec = parameter({ type: 'string', maxLength: 4, initial: '' });

    expect(coerceParam(spec, 'нейросети')).toBe('нейр');
  });

  it('keeps a boolean strict', () => {
    const spec = parameter({ type: 'boolean', initial: false });

    expect(coerceParam(spec, 'true')).toBe(false);
    expect(coerceParam(spec, true)).toBe(true);
  });

  it('rejects an asset key that is not a string', () => {
    const spec = parameter({ type: 'asset', initial: 'owl' });

    expect(coerceParam(spec, 3)).toBe('owl');
    expect(coerceParam(spec, 'panda')).toBe('panda');
  });
});

describe('enumFromInput', () => {
  it('maps a select string back to the declared numeric value', () => {
    const spec = parameter({ type: 'enum', values: [400, 700], initial: 400 });

    expect(enumFromInput(spec, '700')).toBe(700);
  });

  it('passes an unknown value through for coerceParam to reject', () => {
    const spec = parameter({ type: 'enum', values: ['a'], initial: 'a' });

    expect(enumFromInput(spec, 'z')).toBe('z');
  });
});
