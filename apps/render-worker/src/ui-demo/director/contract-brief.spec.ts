import { describe, expect, it } from 'vitest';
import {
  DIRECTOR_SYSTEM_PROMPT,
  buildContractBrief,
  buildUserPrompt,
} from './contract-brief.js';

describe('director contract brief', () => {
  it('describes only primitives the renderer can actually draw', () => {
    const brief = buildContractBrief();

    expect(brief).toContain('- track');
    expect(brief).toContain('- thumb');
    expect(brief).not.toContain('- avatar');
    expect(brief).not.toContain('- object');
  });

  it('carries the real safe bounds, not rounded numbers', () => {
    const brief = buildContractBrief();

    expect(brief).toContain('x 72..890');
    expect(brief).toContain('y 80..1620');
  });

  it('asks for one spec scene with a sequence', () => {
    const prompt = buildUserPrompt('тема');

    expect(prompt).toContain('"device": "spec"');
    expect(prompt).toContain('sequence');
    expect(DIRECTOR_SYSTEM_PROMPT).toContain('JSON');
  });
});
