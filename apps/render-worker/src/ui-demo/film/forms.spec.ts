import { describe, expect, it } from 'vitest';
import type { UiEpisode } from '../spec.js';
import { DRAMATIC_FORMS, assignmentFor, structuralSignature } from './forms.js';

/**
 * Diversity is assigned at the input and measured on the output: the same topic
 * keeps its brief, and two different answers to different topics must not share
 * a structure.
 */
describe('forms and carriers', () => {
  it('assigns the same form and carrier to the same topic', () => {
    expect(assignmentFor('01-subscriptions')).toEqual(assignmentFor('01-subscriptions'));
  });

  it('spreads forms across topics', () => {
    const forms = new Set(
      ['01-subscriptions', '02-doctor', '03-discount', '04-features', '05-delivery'].map(
        (slug) => assignmentFor(slug).form,
      ),
    );

    expect(forms.size).toBeGreaterThan(1);
    expect(DRAMATIC_FORMS).toContain(assignmentFor('01-subscriptions').form);
  });

  it('separates two films by primitives and motion, not by copy', () => {
    const film = (primitives: string[], transitions: string[]): UiEpisode => ({
      schemaVersion: 1,
      themeId: 'studio-dark',
      captions: false,
      speech: [],
      scenes: [
        {
          id: 's',
          device: 'spec',
          durationSec: 3,
          revealSec: 1,
          themeId: 'studio-dark',
          spec: {
            kind: 'composition',
            elements: primitives.map((primitive, index) => ({
              id: `e${index}`,
              primitive,
              layout: { x: 72, y: 300, width: 300, height: 200 },
              params: {},
              states: [],
              transitions: [],
              operations: [],
              links: [],
            })),
            sequence: transitions.map((transition, index) => ({
              at: index * 0.5,
              element: `e${index}`,
              transition,
            })),
          },
        },
      ],
    });
    const first = structuralSignature(film(['stage', 'card', 'label'], ['appear', 'type']));
    const second = structuralSignature(film(['stage', 'card', 'label'], ['appear', 'type']));
    const third = structuralSignature(
      film(['stage', 'grid', 'track'], ['appear', 'fill', 'break']),
    );

    expect(first).toBe(second);
    expect(first).not.toBe(third);
  });
});
