import { describe, expect, it } from 'vitest';
import {
  CARTOON_CHARACTER_BLUEPRINT,
  CHARACTER_ANCHOR_IDS,
  CHARACTER_BOUNDS_IDS,
  CHARACTER_BLUEPRINT_VERSION,
  CHARACTER_CANVAS,
  CHARACTER_LAYER_IDS,
  CHARACTER_PART_IDS,
  type CharacterBounds,
  type CharacterPoint,
} from './character.js';

const { canvas, body, arms, anchors, bounds } = CARTOON_CHARACTER_BLUEPRINT;

function contains(box: CharacterBounds, point: CharacterPoint): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

describe('character blueprint', () => {
  it('describes a frontal 400×700 rig with the current version', () => {
    expect(CHARACTER_BLUEPRINT_VERSION).toBe('v1');
    expect(CARTOON_CHARACTER_BLUEPRINT.version).toBe(
      CHARACTER_BLUEPRINT_VERSION,
    );
    expect(CARTOON_CHARACTER_BLUEPRINT.view).toBe('front');
    expect(canvas).toEqual({ width: 400, height: 700 });
    expect(CHARACTER_CANVAS).toEqual(canvas);
  });

  it('declares every anchor and bound that consumers rely on', () => {
    expect(Object.keys(anchors).sort()).toEqual([...CHARACTER_ANCHOR_IDS].sort());
    expect(Object.keys(bounds).sort()).toEqual([...CHARACTER_BOUNDS_IDS].sort());
  });

  it('keeps every anchor inside the canvas', () => {
    for (const id of CHARACTER_ANCHOR_IDS) {
      const point = anchors[id];

      expect(point.x, id).toBeGreaterThanOrEqual(0);
      expect(point.x, id).toBeLessThanOrEqual(canvas.width);
      expect(point.y, id).toBeGreaterThanOrEqual(0);
      expect(point.y, id).toBeLessThanOrEqual(canvas.height);
    }
  });

  it('derives bounds from the same primitives as the shapes', () => {
    expect(bounds.head).toEqual({
      x: body.head.cx - body.head.rx,
      y: body.head.cy - body.head.ry,
      width: body.head.rx * 2,
      height: body.head.ry * 2,
    });
    expect(bounds.neck).toMatchObject({
      x: body.neck.x,
      y: body.neck.y,
      width: body.neck.width,
      height: body.neck.height,
    });
    expect(bounds.torso).toMatchObject({
      x: body.torso.x,
      y: body.torso.y,
      width: body.torso.width,
      height: body.torso.height,
    });
    expect(contains(bounds.shoulders, anchors['shoulder-left'])).toBe(true);
    expect(contains(bounds.shoulders, anchors['shoulder-right'])).toBe(true);
    expect(contains(bounds['hand-left'], anchors['hand-idle-left'])).toBe(true);
    expect(contains(bounds['hand-right'], anchors['hand-idle-right'])).toBe(
      true,
    );
    expect(contains(bounds.head, anchors['face-center'])).toBe(true);
    expect(contains(bounds.head, anchors.mouth)).toBe(true);
    expect(contains(bounds.neck, anchors.neck)).toBe(true);
    expect(bounds.shoulders.width).toBe(
      arms.shoulderRight.x - arms.shoulderLeft.x + arms.strokeWidth,
    );
  });

  it('orders every part once and puts z-zones in a real position', () => {
    expect([...CARTOON_CHARACTER_BLUEPRINT.drawOrder].sort()).toEqual(
      [...CHARACTER_PART_IDS].sort(),
    );

    const zones = CARTOON_CHARACTER_BLUEPRINT.layers;

    expect(zones.map((zone) => zone.id)).toEqual([...CHARACTER_LAYER_IDS]);

    for (const zone of zones) {
      if (zone.insertAfter === null) {
        expect(zone.id).toBe('behind-body');
      } else {
        expect(CARTOON_CHARACTER_BLUEPRINT.drawOrder).toContain(
          zone.insertAfter,
        );
      }
    }

    // Zones must not lie about their name: a hat sits over hair, glasses over
    // the face, a badge over the torso.
    const byId = new Map(zones.map((zone) => [zone.id, zone.insertAfter]));

    expect(byId.get('over-hair')).toBe('hair');
    expect(byId.get('above-face')).toBe('mouth');
    expect(byId.get('over-body')).toBe('torso');
  });
});
