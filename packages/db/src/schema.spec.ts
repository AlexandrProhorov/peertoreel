import {
  PUBLISH_CARD_STATES,
  RUN_STAGES,
  RUN_STATES,
} from '@kadence/contracts';
import { describe, expect, it } from 'vitest';
import {
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
});
