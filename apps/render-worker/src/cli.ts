import {
  storyboardFixture15Deg,
  storyboardSchema,
  wordTimingsFixture15Deg,
  type ComponentParamDiagnostic,
  type DerivedWord,
  type Storyboard,
} from '@peertoreel/contracts';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveStoryboardAssets,
  type ProviderMode,
  type ResolvedAssetSummary,
  type StoryboardAssetResolution,
  type StoryboardProviderConfig,
} from './asset-resolution.js';
import { createAssetPersistence } from './asset-persistence.js';
import { parseDeepSeekSvgEnv } from './provider-config.js';
import { resolvedAssetMapSchema, type ResolvedAssetMap } from './props.js';
import { renderScene, sceneOutputPath } from './render.js';
import { config as loadEnv } from 'dotenv';

type RenderKind = 'fixture' | 'custom';

interface RenderedScene {
  index: number;
  id: string;
  part: string;
  componentId: string;
  source: string;
  recipe: { id: string; variant: string } | null;
  durationInFrames: number;
  durationSec: number;
  sizeBytes: number;
  renderMs: number;
  outPath: string;
  slotDiagnostics: ComponentParamDiagnostic[];
  diagnostics: ComponentParamDiagnostic[];
}

interface RenderManifest {
  kind: RenderKind;
  input: string | null;
  runId: string;
  styleId: string;
  generatedAt: string;
  totalMs: number;
  scenes: RenderedScene[];
  assets?: {
    resolutions: readonly ResolvedAssetSummary[];
    usage: StoryboardAssetResolution['usage'];
    persisted: boolean;
    injected: number;
  };
}

interface RenderRunInput {
  kind: RenderKind;
  input: string | null;
  storyboard: Storyboard;
  wordTimings?: readonly DerivedWord[];
  assets?: ResolvedAssetMap;
  assetResolution?: StoryboardAssetResolution;
  outDir: string;
  sceneFilter?: number;
  manifestName: string;
}

function usage(): void {
  console.log(`Usage:
  pnpm --filter @peertoreel/render-worker render-fixture [--scene <index>] [--out <dir>]
  pnpm --filter @peertoreel/render-worker render-storyboard -- --input <storyboard.json> [--scene <index>] [--out <dir>]
      [--resolve-assets] [--assets <map.json>] [--provider=fake|deepseek-svg] [--persist]

Renders silent 1080x1920/30 h264 scene clips from a peertoreel.storyboard.v1
document. render-fixture is the shortcut for the built-in -15° fixture.
--resolve-assets resolves subject keys through the Asset Resolver and passes
data-URI URLs into Remotion input props; --provider=fake enables the offline
fake ImageProvider for keys missing from Tier 0; --provider=deepseek-svg calls
the DeepSeek SVG generator (needs DEEPSEEK_API_KEY plus LLM_*USD_PER_MTOK in
.env). --assets <map.json> injects
already-resolved URLs (episode mode: Pixabay images); injected keys win and
the rest still resolves through Tier 0. --persist (with --resolve-assets)
writes rows to Postgres and bytes to S3, then passes presigned URLs into
props; it needs DATABASE_URL and S3_* in .env.
`);
}

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`${name}=`),
  );

  if (inline !== undefined) {
    const value = inline.slice(name.length + 1);

    if (value.length === 0) {
      throw new Error(`Option ${name} requires a value`);
    }

    return value;
  }

  const index = process.argv.indexOf(name);

  if (index < 0) {
    return undefined;
  }

  const value = process.argv[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Option ${name} requires a value`);
  }

  return value;
}

function sceneFilterValue(): number | undefined {
  const raw = optionValue('--scene');

  if (raw === undefined) {
    return undefined;
  }

  const index = Number(raw);

  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`--scene must be a non-negative integer, received "${raw}"`);
  }

  return index;
}

function providerModeValue(): ProviderMode {
  const raw = optionValue('--provider');

  if (raw === undefined || raw === 'none') {
    return 'none';
  }

  if (raw === 'fake') {
    return 'fake';
  }

  if (raw === 'deepseek-svg') {
    return 'deepseek-svg';
  }

  throw new Error(
    `--provider must be "fake", "deepseek-svg" or "none", received "${raw}"`,
  );
}

function publicDirPath(): string {
  return fileURLToPath(new URL('../public', import.meta.url));
}

function formatIssues(error: {
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>;
}): string {
  return error.issues
    .map((issue) => {
      const issuePath =
        issue.path.length > 0 ? issue.path.map(String).join('.') : '$';

      return `  - ${issuePath}: ${issue.message}`;
    })
    .join('\n');
}

async function readStoryboard(
  inputPath: string,
): Promise<{ storyboard: Storyboard; inputPath: string }> {
  const resolvedPath = path.resolve(process.cwd(), inputPath);
  const text = await readFile(resolvedPath, 'utf8');
  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(`Storyboard ${inputPath} is not valid JSON: ${reason}`);
  }

  const parsed = storyboardSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(
      `Invalid storyboard ${inputPath}:\n${formatIssues(parsed.error)}`,
    );
  }

  return { storyboard: parsed.data, inputPath };
}

/**
 * Injected assets come from the worker (episode mode). They are validated at
 * this boundary so a malformed map fails before Remotion starts.
 */
async function readInjectedAssets(mapPath: string): Promise<ResolvedAssetMap> {
  const resolvedPath = path.resolve(process.cwd(), mapPath);
  const text = await readFile(resolvedPath, 'utf8');
  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(`Assets map ${mapPath} is not valid JSON: ${reason}`);
  }

  const parsed = resolvedAssetMapSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(
      `Invalid assets map ${mapPath}:\n${formatIssues(parsed.error)}`,
    );
  }

  return parsed.data;
}

function logDiagnostics(
  sceneId: string,
  kind: 'params' | 'slots',
  diagnostics: ComponentParamDiagnostic[],
): void {
  for (const diagnostic of diagnostics) {
    console.warn(
      `  ${kind} diagnostic: ${sceneId} ${diagnostic.path} ${diagnostic.reason} received=${JSON.stringify(diagnostic.received)}`,
    );
  }
}

async function renderStoryboard(input: RenderRunInput): Promise<void> {
  const selected = input.storyboard.scenes
    .map((scene, index) => ({ scene, index }))
    .filter(
      ({ index }) => input.sceneFilter === undefined || index === input.sceneFilter,
    );

  if (selected.length === 0) {
    throw new Error(
      `Scene ${input.sceneFilter} does not exist in ${input.input ?? input.kind}`,
    );
  }

  await mkdir(input.outDir, { recursive: true });

  if (input.sceneFilter === undefined) {
    const existing = await readdir(input.outDir);

    await Promise.all(
      existing
        .filter((name) => /^scene-\d+\.mp4$/.test(name))
        .map((name) => unlink(path.join(input.outDir, name))),
    );
  }

  const startedAt = Date.now();
  const rendered: RenderedScene[] = [];

  for (const { scene, index } of selected) {
    const outPath = sceneOutputPath(input.outDir, index);
    const lastLogged = { value: -1 };
    const sceneStartedAt = Date.now();

    console.log(
      `[${index + 1}/${selected.length}] ${scene.id} (${scene.durationSec}s) -> ${outPath}`,
    );

    const result = await renderScene({
      scene,
      style: input.storyboard.style,
      wordTimings: input.wordTimings,
      assets: input.assets,
      outPath,
      onProgress: (progress) => {
        const percent = Math.floor(progress * 10) * 10;

        if (percent > lastLogged.value) {
          lastLogged.value = percent;
          console.log(`  ${scene.id}: ${percent}%`);
        }
      },
    });

    logDiagnostics(scene.id, 'slots', result.slotDiagnostics);
    logDiagnostics(scene.id, 'params', result.diagnostics);
    console.log(
      `  resolved: ${result.componentId} (${result.source}), recipe: ${
        result.recipe ? `${result.recipe.id}/${result.recipe.variant}` : 'none'
      }, ${result.diagnostics.length} param diagnostic(s), ${result.slotDiagnostics.length} slot diagnostic(s)`,
    );

    const renderMs = Date.now() - sceneStartedAt;

    rendered.push({
      index,
      id: scene.id,
      part: scene.part,
      componentId: result.componentId,
      source: result.source,
      recipe: result.recipe
        ? { id: result.recipe.id, variant: result.recipe.variant }
        : null,
      durationInFrames: result.durationInFrames,
      durationSec: result.durationSec,
      sizeBytes: result.sizeBytes,
      renderMs,
      outPath,
      slotDiagnostics: result.slotDiagnostics,
      diagnostics: result.diagnostics,
    });

    console.log(
      `  done: ${result.durationInFrames} frames, ${result.sizeBytes} bytes, ${renderMs} ms`,
    );
  }

  const totalMs = Date.now() - startedAt;
  const manifest: RenderManifest = {
    kind: input.kind,
    input: input.input,
    runId: input.storyboard.runId,
    styleId: input.storyboard.style.styleId,
    generatedAt: new Date().toISOString(),
    totalMs,
    scenes: rendered,
    ...(input.assetResolution
      ? {
          assets: {
            resolutions: input.assetResolution.resolutions,
            usage: input.assetResolution.usage,
            persisted: input.assetResolution.persisted,
            injected: input.assetResolution.injected,
          },
        }
      : {}),
  };
  const manifestPath = path.join(input.outDir, input.manifestName);

  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  console.log(`\nRendered ${rendered.length} scene(s) in ${totalMs} ms`);
  console.log(`Manifest: ${manifestPath}`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const sceneFilter = sceneFilterValue();
  const providerMode = providerModeValue();
  const outDir = path.resolve(process.cwd(), optionValue('--out') ?? 'out');

  if (command === 'render-fixture') {
    await renderStoryboard({
      kind: 'fixture',
      input: null,
      storyboard: storyboardFixture15Deg,
      wordTimings: wordTimingsFixture15Deg,
      outDir,
      sceneFilter,
      manifestName: 'render-fixture.json',
    });

    return;
  }

  if (command === 'render-storyboard') {
    const input = optionValue('--input');

    if (input === undefined) {
      throw new Error('render-storyboard requires --input <storyboard.json>');
    }

    const loaded = await readStoryboard(input);
    const assetsPath = optionValue('--assets');
    const injected =
      assetsPath === undefined ? null : await readInjectedAssets(assetsPath);
    const resolveAssets =
      process.argv.includes('--resolve-assets') || injected !== null;
    const persist = process.argv.includes('--persist');

    if (persist && !resolveAssets) {
      throw new Error('--persist requires --resolve-assets');
    }

    if (providerMode === 'deepseek-svg' && !persist) {
      throw new Error(
        '--provider=deepseek-svg requires --persist so the spend is recorded in provider_usage',
      );
    }

    if (persist || providerMode === 'deepseek-svg') {
      loadEnv({
        path: fileURLToPath(new URL('../../../.env', import.meta.url)),
        quiet: true,
      });
    }

    const persistence = persist ? createAssetPersistence(process.env) : null;
    const providerConfig: StoryboardProviderConfig | null =
      providerMode === 'deepseek-svg'
        ? { deepseek: parseDeepSeekSvgEnv(process.env) }
        : null;

    try {
      const assetResolution = resolveAssets
        ? await resolveStoryboardAssets(
            loaded.storyboard,
            publicDirPath(),
            providerMode,
            persistence,
            injected,
            persistence === null
              ? null
              : { writer: persistence.usageWriter, source: 'cli' },
            providerConfig,
          )
        : undefined;

      if (assetResolution !== undefined) {
        console.log(
          `Resolved ${assetResolution.resolutions.length} asset(s)${
            assetResolution.persisted ? ' → Postgres + S3' : ''
          }${
            assetResolution.injected > 0
              ? `, injected ${assetResolution.injected}`
              : ''
          }: ${assetResolution.resolutions
            .map((entry) => `${entry.assetKey}(${entry.tier})`)
            .join(', ')}`,
        );
      }

      await renderStoryboard({
        kind: 'custom',
        input: loaded.inputPath,
        storyboard: loaded.storyboard,
        assets: assetResolution?.assets,
        assetResolution,
        outDir,
        sceneFilter,
        manifestName: 'manifest.json',
      });
    } finally {
      await persistence?.close();
    }

    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
