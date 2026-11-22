import { describe, expect, it } from 'vitest';
import { parseRenderProgressLine } from './render-cli.js';

describe('render progress lines', () => {
  it('parses the total and a finished scene', () => {
    expect(
      parseRenderProgressLine('##progress {"type":"total","total":5}'),
    ).toEqual({ type: 'total', total: 5 });
    expect(
      parseRenderProgressLine(
        '##progress {"type":"scene","index":2,"total":5,"id":"wet-nose","renderMs":4200}',
      ),
    ).toEqual({
      type: 'scene',
      index: 2,
      total: 5,
      id: 'wet-nose',
      renderMs: 4200,
    });
  });

  it('ignores human log lines, unknown types and malformed JSON', () => {
    expect(parseRenderProgressLine('[1/5] wet-nose (3s) -> scene-0.mp4')).toBeNull();
    expect(parseRenderProgressLine('##progress not-json')).toBeNull();
    expect(
      parseRenderProgressLine('##progress {"type":"frame","total":5}'),
    ).toBeNull();
  });

  it('rejects scene events with an impossible index or duration', () => {
    expect(
      parseRenderProgressLine(
        '##progress {"type":"scene","index":6,"total":5,"id":"x","renderMs":10}',
      ),
    ).toBeNull();
    expect(
      parseRenderProgressLine(
        '##progress {"type":"scene","index":1,"total":5,"id":"x","renderMs":-1}',
      ),
    ).toBeNull();
    expect(
      parseRenderProgressLine('##progress {"type":"total","total":0}'),
    ).toBeNull();
  });
});
