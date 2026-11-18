import { describe, expect, it } from 'vitest';
import { PRIMITIVES, type PrimitiveId } from '../catalog.js';
import { TYPE_SCALE, type TypeToken } from '../typography.js';
import {
  DIRECTOR_SYSTEM_PROMPT,
  PRIMITIVE_SEMANTICS,
  buildContractBrief,
  buildTypographyBrief,
  buildUserPrompt,
} from './contract-brief.js';

/**
 * The prompt is generated from the catalogue. These tests fail when the two
 * drift: a new primitive or token must reach the model or the prompt is lying.
 */
describe('director prompt covers the catalogue', () => {
  it('describes every drawable primitive', () => {
    const brief = buildContractBrief();

    for (const id of Object.keys(PRIMITIVES)) {
      if (id === 'avatar' || id === 'object') {
        continue;
      }

      expect(brief).toContain(`- ${id} — `);
    }
  });

  it('gives every drawable primitive a semantic line', () => {
    for (const id of Object.keys(PRIMITIVES) as PrimitiveId[]) {
      if (id === 'avatar' || id === 'object') {
        continue;
      }

      expect(PRIMITIVE_SEMANTICS[id]).toBeTruthy();
    }
  });

  it('lists every type token with its box range', () => {
    const brief = buildTypographyBrief();

    for (const token of Object.keys(TYPE_SCALE) as TypeToken[]) {
      expect(brief).toContain(`- ${token} (`);
    }
  });

  it('carries the real safe bounds and budgets', () => {
    const prompt = buildUserPrompt('тема');

    expect(prompt).toContain('x 72..890');
    expect(prompt).toContain('y 80..1620');
    expect(prompt).toContain('от 2 до 6 элементов');
  });

  it('asks for one spec scene with a sequence', () => {
    const prompt = buildUserPrompt('тема');

    expect(prompt).toContain('"device": "spec"');
    expect(prompt).toContain('sequence');
    expect(DIRECTOR_SYSTEM_PROMPT).toContain('JSON');
  });

  it('keeps direction in the system prompt, not a list of bans', () => {
    expect(DIRECTOR_SYSTEM_PROMPT).toContain('Что зритель должен понять');
    expect(DIRECTOR_SYSTEM_PROMPT).toContain('Что изменилось к концу');
    expect(DIRECTOR_SYSTEM_PROMPT).not.toContain('запрещено');
  });
});
