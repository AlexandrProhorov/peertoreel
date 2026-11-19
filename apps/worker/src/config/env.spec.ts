import { describe, expect, it } from 'vitest';
import { loadWorkerEnv } from './env.js';

describe('worker env for episode visuals', () => {
  it('defaults to Pixabay and a $0.25 run budget', () => {
    const env = loadWorkerEnv({});

    expect(env.VISUALS_SOURCE).toBe('pixabay');
    expect(env.ASSET_LLM_MAX_USD_PER_RUN).toBe(0.25);
    expect(env.ASSET_LLM_MAX_USD_PER_CALL).toBe(0.02);
    expect(env.LLM_INPUT_USD_PER_MTOK).toBeUndefined();
    expect(env.LLM_OUTPUT_USD_PER_MTOK).toBeUndefined();
  });

  it('parses the deepseek-svg source, tariffs and budget', () => {
    const env = loadWorkerEnv({
      VISUALS_SOURCE: 'deepseek-svg',
      LLM_INPUT_USD_PER_MTOK: '0.15',
      LLM_OUTPUT_USD_PER_MTOK: '0.6',
      ASSET_LLM_MAX_USD_PER_CALL: '0.01',
      ASSET_LLM_MAX_USD_PER_RUN: '0.5',
    });

    expect(env.VISUALS_SOURCE).toBe('deepseek-svg');
    expect(env.LLM_INPUT_USD_PER_MTOK).toBe(0.15);
    expect(env.LLM_OUTPUT_USD_PER_MTOK).toBe(0.6);
    expect(env.ASSET_LLM_MAX_USD_PER_CALL).toBe(0.01);
    expect(env.ASSET_LLM_MAX_USD_PER_RUN).toBe(0.5);
  });

  it('rejects an unknown visual source and a non-positive budget', () => {
    expect(() => loadWorkerEnv({ VISUALS_SOURCE: 'recraft' })).toThrow(
      'VISUALS_SOURCE',
    );
    expect(() => loadWorkerEnv({ ASSET_LLM_MAX_USD_PER_RUN: '0' })).toThrow(
      'ASSET_LLM_MAX_USD_PER_RUN',
    );
    expect(() => loadWorkerEnv({ LLM_INPUT_USD_PER_MTOK: 'free' })).toThrow(
      'LLM_INPUT_USD_PER_MTOK',
    );
  });
});
