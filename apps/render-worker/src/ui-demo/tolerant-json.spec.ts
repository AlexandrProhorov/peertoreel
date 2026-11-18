import { describe, expect, it } from 'vitest';
import { parseJsonResponse } from './tolerant-json.js';

/**
 * A trailing sentence after the object is commentary, not a reason to lose the
 * scene; a broken object inside is still broken.
 */
describe('tolerant JSON', () => {
  it('reads an object with trailing commentary', () => {
    expect(
      parseJsonResponse('{"scenes":[],"ok":true}\nНадеюсь, подойдёт. Если нужно — переделаю.'),
    ).toEqual({ scenes: [], ok: true });
  });

  it('reads an array with a leading sentence', () => {
    expect(parseJsonResponse('Вот ответ: [1,2,{"a":3}] и всё.')).toEqual([1, 2, { a: 3 }]);
  });

  it('keeps braces and brackets inside strings', () => {
    expect(parseJsonResponse('{"text":"}[{","n":1} хвост')).toEqual({
      text: '}[{',
      n: 1,
    });
  });

  it('fails on a truncated object instead of inventing the rest', () => {
    expect(() => parseJsonResponse('{"scenes":[{"id":"a"}')).toThrow();
  });
});
