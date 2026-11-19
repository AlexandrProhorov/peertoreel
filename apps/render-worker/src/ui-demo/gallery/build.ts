/**
 * One command builds both halves of the gallery:
 *
 * 1. `catalog.json` for Angular — descriptions, parameters, defaults, themes;
 * 2. the browser playground — the same primitives, rendered by the real
 *    `SpecRenderer` inside an iframe.
 *
 * Both are generated from `catalog.ts`, so the card text and the preview cannot
 * describe different primitives.
 */

import { build } from 'esbuild';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_ASSETS } from '../assets.js';
import { buildGalleryCatalog } from './catalog.js';

const here = dirname(fileURLToPath(import.meta.url));
/** `apps/render-worker/src/ui-demo/gallery` → the repository root. */
const repoRoot = resolve(here, '../../../../..');
const webPublic = join(repoRoot, 'apps/web/public/gallery');
const catalogPath = join(
  repoRoot,
  'apps/web/src/app/features/gallery/data-access/catalog.json',
);

const INDEX_HTML = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>UI playground</title>
    <style>
      html,
      body {
        margin: 0;
        height: 100%;
        background: #0a0a0b;
        overflow: hidden;
      }

      #root {
        height: 100%;
      }
    </style>
    <script>
      /* Remotion's staticFile() prefixes the local asset library with this base.
         Derived from the frame's own URL so a sub-path deploy keeps working. */
      (function () {
        var base = new URL('../', window.location.href).pathname;
        window.remotion_staticBase = base.endsWith('/')
          ? base.slice(0, -1)
          : base;
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <link rel="stylesheet" href="./playground.css" />
    <script type="module" src="./playground.js"></script>
  </body>
</html>
`;

async function writeCatalog(): Promise<void> {
  const catalog = buildGalleryCatalog();

  await mkdir(dirname(catalogPath), { recursive: true });
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
}

async function writePlayground(): Promise<void> {
  const outDir = join(webPublic, 'playground');

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'index.html'), INDEX_HTML, 'utf8');

  await build({
    entryPoints: [join(here, 'app/main.tsx')],
    outfile: join(outDir, 'playground.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    minify: true,
    /* Fonts are emitted next to the bundle; the document resolves them relatively. */
    loader: { '.woff2': 'file', '.woff': 'file' },
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'none',
    logLevel: 'warning',
  });
}

/** Avatar and object previews read the same PNGs the renderer uses. */
async function copyAssets(): Promise<void> {
  for (const asset of Object.values(LOCAL_ASSETS)) {
    const target = join(webPublic, asset.file);

    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(repoRoot, 'apps/render-worker/public', asset.file), target);
  }
}

await writeCatalog();
await writePlayground();
await copyAssets();

console.log(
  `gallery: catalog → ${catalogPath}\n` +
    `gallery: playground → ${join(webPublic, 'playground')}`,
);
