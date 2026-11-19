import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
const CORE_PATHS = ['render.ts', 'composition', 'components'];
const FIXTURE_SYMBOLS = [
  'storyboardFixture15Deg',
  'wordTimingsFixture15Deg',
  'storyboard.fixture',
];

function collectSourceFiles(target: string): string[] {
  const stat = statSync(target);

  if (stat.isFile()) {
    return [target];
  }

  return readdirSync(target).flatMap((entry) =>
    collectSourceFiles(path.join(target, entry)),
  );
}

/**
 * The renderer must be data-driven. Only the CLI may import the built-in
 * fixture; `render.ts`, `composition/**` and `components/**` must not.
 */
describe('fixture boundary', () => {
  const coreFiles = CORE_PATHS.flatMap((target) =>
    collectSourceFiles(path.join(SRC_DIR, target)),
  ).filter(
    (file) =>
      /\.(ts|tsx)$/.test(file) &&
      !file.endsWith('.spec.ts') &&
      !file.endsWith('.spec.tsx'),
  );

  it('finds the core render files it is meant to guard', () => {
    expect(coreFiles).toEqual(
      expect.arrayContaining([
        path.join(SRC_DIR, 'render.ts'),
        path.join(SRC_DIR, 'composition', 'SceneComposition.tsx'),
        path.join(SRC_DIR, 'components', 'ParallaxCity.tsx'),
      ]),
    );
  });

  it.each(coreFiles)('%s does not reference fixtures', (file) => {
    const source = readFileSync(file, 'utf8');

    for (const symbol of FIXTURE_SYMBOLS) {
      expect(source).not.toContain(symbol);
    }
  });

  it.each(coreFiles)('%s does not import the asset library or a datastore', (file) => {
    const source = readFileSync(file, 'utf8');

    for (const symbol of [
      '@peertoreel/assets',
      'asset-resolution',
      '@peertoreel/db',
      '@peertoreel/storage',
    ]) {
      expect(source).not.toContain(symbol);
    }
  });
});
