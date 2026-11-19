import { describe, expect, it } from 'vitest';
import { reviewDiffs, stillRuns } from './review.js';

/**
 * Dead time is measured on sampled frames: a stretch where the picture does not
 * change is the most obvious defect the geometry gates cannot see.
 */
describe('frame review', () => {
  it('finds the longest still run', () => {
    expect(stillRuns([0, 0.4, 1, 9, 0.2, 0.1, 8])).toEqual([3, 2]);
  });

  it('reports dead seconds and the longest still stretch', () => {
    const report = reviewDiffs([10, 10, 0.5, 0.5, 10, 10]);

    expect(report.deadFrames).toBe(2);
    expect(report.deadSeconds).toBe(1);
    expect(report.longestStillSeconds).toBe(1.5);
    expect(report.tailSeconds).toBe(0.5);
  });

  it('measures how long the film lives past its last change', () => {
    const report = reviewDiffs([10, 10, 0.2, 0.2, 0.1, 0.1]);

    /* The last visible change is the second frame: four still samples follow. */
    expect(report.tailSeconds).toBe(2.5);
  });

  it('counts a film that always moves as having no dead time', () => {
    expect(reviewDiffs([5, 6, 7, 8]).deadFrames).toBe(0);
  });
});
