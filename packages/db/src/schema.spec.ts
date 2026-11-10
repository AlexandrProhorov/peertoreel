import {
  ASSET_KINDS,
  ASSET_SOURCES,
  PUBLISH_CARD_STATES,
  RUN_STAGES,
  RUN_STATES,
} from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import {
  assetKindValues,
  assetSourceValues,
  publishCardStateValues,
  runStageValues,
  runStateValues,
} from './schema.js';

describe('db enums', () => {
  it('keeps run states in sync with contracts', () => {
    expect([...runStateValues]).toEqual([...RUN_STATES]);
  });

  it('keeps run stages in sync with contracts', () => {
    expect([...runStageValues]).toEqual([...RUN_STAGES]);
  });

  it('keeps publish card states in sync with contracts', () => {
    expect([...publishCardStateValues]).toEqual([...PUBLISH_CARD_STATES]);
  });

  it('keeps asset sources in sync with contracts', () => {
    expect([...assetSourceValues]).toEqual([...ASSET_SOURCES]);
  });

  it('keeps asset kinds in sync with contracts', () => {
    expect([...assetKindValues]).toEqual([...ASSET_KINDS]);
  });
});
