import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ASSET_KEYS } from '../assets.js';
import { PRIMITIVES, type PrimitiveId } from '../catalog.js';
import { buildContractBrief } from '../director/contract-brief.js';
import { buildGalleryCatalog, type GalleryParameter } from './catalog.js';
import { previewParams, previewScene } from './preview.js';

const here = dirname(fileURLToPath(import.meta.url));
const committedCatalogPath = resolve(
  here,
  '../../../../../apps/web/src/app/features/gallery/data-access/catalog.json',
);

const catalog = buildGalleryCatalog();

function isInside(parameter: GalleryParameter): boolean {
  const value = parameter.initial;

  switch (parameter.type) {
    case 'number':
      return (
        typeof value === 'number' &&
        (parameter.min === undefined || value >= parameter.min) &&
        (parameter.max === undefined || value <= parameter.max)
      );
    case 'boolean':
      return typeof value === 'boolean';
    case 'enum':
      return (parameter.values ?? []).includes(value as string | number);
    case 'asset':
      return (
        typeof value === 'string' &&
        (ASSET_KEYS as readonly string[]).includes(value)
      );
    case 'string':
    case 'color':
      return (
        typeof value === 'string' &&
        (parameter.maxLength === undefined ||
          value.length <= parameter.maxLength)
      );
  }
}

describe('gallery catalogue', () => {
  it('describes every primitive exactly once', () => {
    expect(catalog.primitives.map((primitive) => primitive.id)).toEqual(
      Object.keys(PRIMITIVES),
    );
  });

  it('shows the director exactly the text the model reads', () => {
    const offered = catalog.primitives
      .filter((primitive) => primitive.offeredToDirector)
      .map((primitive) => primitive.prompt.join('\n'))
      .join('\n');

    expect(offered).toBe(buildContractBrief());
  });

  it('keeps the primitives that need local assets away from the director', () => {
    for (const id of ['avatar', 'object'] as const) {
      const primitive = catalog.primitives.find((item) => item.id === id);

      expect(primitive?.offeredToDirector).toBe(false);
      expect(primitive?.prompt).toEqual([]);
    }
  });

  it('starts every parameter inside the declared contract', () => {
    for (const primitive of catalog.primitives) {
      expect(primitive.parameters.length).toBe(
        Object.keys(PRIMITIVES[primitive.id].parameters).length,
      );

      for (const parameter of primitive.parameters) {
        expect(isInside(parameter), `${primitive.id}.${parameter.name}`).toBe(
          true,
        );
      }
    }
  });

  it('renders a preview for every primitive', () => {
    for (const id of Object.keys(PRIMITIVES) as PrimitiveId[]) {
      const scene = previewScene(id, previewParams(id), 'studio-dark');

      expect(scene.spec.elements.length).toBe(id === 'stage' ? 1 : 2);
      expect(scene.spec.elements[0]?.primitive).toBe('stage');
      expect(scene.spec.sequence.length).toBeGreaterThan(0);
    }
  });

  it('keeps the committed web snapshot in sync with the catalogue', () => {
    const committed = JSON.parse(
      readFileSync(committedCatalogPath, 'utf8'),
    ) as unknown;

    expect(committed).toEqual(catalog);
  });
});
