import {
  storyboardFixture15Deg,
  wordTimingsFixture15Deg,
} from '@peertoreel/contracts';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveSceneComponent } from './mapping.js';
import { renderScene, sceneOutputPath } from './render.js';

interface RenderedScene {
  index: number;
  id: string;
  component: string;
  durationInFrames: number;
  durationSec: number;
  sizeBytes: number;
  renderMs: number;
  outPath: string;
}

function usage(): void {
  console.log(`Usage:
  pnpm --filter @peertoreel/render-worker render-fixture [--scene <index>] [--out <dir>]

Renders the fixed -15° storyboard fixture to silent 1080x1920 mp4 clips.
`);
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);

  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (command !== 'render-fixture') {
    usage();
    process.exitCode = 1;
    return;
  }

  const sceneFilter = optionValue('--scene');
  const outDir = path.resolve(process.cwd(), optionValue('--out') ?? 'out');
  const scenes = storyboardFixture15Deg.scenes;
  const selected = scenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ index }) => sceneFilter === undefined || String(index) === sceneFilter);

  if (selected.length === 0) {
    throw new Error(`Scene ${sceneFilter} does not exist`);
  }

  await mkdir(outDir, { recursive: true });

  if (sceneFilter === undefined) {
    const existing = await readdir(outDir);

    await Promise.all(
      existing
        .filter((name) => /^scene-\d+\.mp4$/.test(name))
        .map((name) => unlink(path.join(outDir, name))),
    );
  }

  const startedAt = Date.now();
  const rendered: RenderedScene[] = [];

  for (const { scene, index } of selected) {
    const outPath = sceneOutputPath(outDir, index);
    const lastLogged = { value: -1 };
    const sceneStartedAt = Date.now();

    console.log(
      `[${index + 1}/${selected.length}] ${scene.id} (${scene.durationSec}s) -> ${outPath}`,
    );

    const result = await renderScene({
      scene,
      style: storyboardFixture15Deg.style,
      wordTimings: wordTimingsFixture15Deg,
      outPath,
      onProgress: (progress) => {
        const percent = Math.floor(progress * 10) * 10;

        if (percent > lastLogged.value) {
          lastLogged.value = percent;
          console.log(`  ${scene.id}: ${percent}%`);
        }
      },
    });

    const renderMs = Date.now() - sceneStartedAt;

    rendered.push({
      index,
      id: scene.id,
      component: resolveSceneComponent(scene).componentId,
      durationInFrames: result.durationInFrames,
      durationSec: result.durationSec,
      sizeBytes: result.sizeBytes,
      renderMs,
      outPath,
    });

    console.log(
      `  done: ${result.durationInFrames} frames, ${result.sizeBytes} bytes, ${renderMs} ms`,
    );
  }

  const totalMs = Date.now() - startedAt;
  const manifestPath = path.join(outDir, 'render-fixture.json');

  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        fixture: storyboardFixture15Deg.runId,
        generatedAt: new Date().toISOString(),
        totalMs,
        scenes: rendered,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`\nRendered ${rendered.length} scene(s) in ${totalMs} ms`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
