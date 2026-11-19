import { normalizeSvg } from '@peertoreel/assets';
import {
  STARTER_ASSET_CATALOG,
  STARTER_ASSET_KEYS,
  STYLE_PRESETS,
} from '@peertoreel/contracts';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Re-colors the authored Tier 0 starter pack into a style preset palette
 * (M3.6b.3, ADR-0017 D13).
 *
 * Tier 0 is stored as-is (no re-quantization on upload), so a palette change is
 * an explicit authoring step: quantize with `paddingRatio: 0` to keep the
 * existing viewBox stable across repeated runs. Bytes change → new content
 * hashes → `assets:import` adds new rows under the preset's style id.
 */

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
const preset = STYLE_PRESETS.studio_flat_2d_v2;
const palette = preset.assetPalette;

let changed = 0;

for (const key of STARTER_ASSET_KEYS) {
  const objectKey = STARTER_ASSET_CATALOG[key].path;
  const file = path.join(publicDir, objectKey);
  const source = await readFile(file, 'utf8');
  const result = normalizeSvg(source, { palette, paddingRatio: 0 });

  if (result.svg !== source) {
    await writeFile(file, result.svg, 'utf8');
    changed += 1;
  }

  console.log(
    `${key}: ${result.replacements.length} color(s), maxΔ ${result.maxColorDistance}`,
  );
}

console.log(`\n${preset.id}: обновлено ${changed} из ${STARTER_ASSET_KEYS.length}`);
console.log('Дальше: pnpm --filter @peertoreel/worker assets:import');
