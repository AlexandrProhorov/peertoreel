import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  SCENE_RENDER_MEDIA_OPTIONS,
} from '../video-target.js';
import {
  UI_EPISODE_COMPOSITION_ID,
  uiEpisodeInputPropsSchema,
  type UiEpisode,
} from './spec.js';

export interface RenderUiEpisodeOptions {
  episode: UiEpisode;
  showSafeZones: boolean;
  outPath: string;
  onProgress?: (progress: number) => void;
}

export interface RenderUiEpisodeResult {
  outPath: string;
  durationInFrames: number;
  sizeBytes: number;
  renderMs: number;
}

function entryPointPath(): string {
  const source = fileURLToPath(new URL('./entry.tsx', import.meta.url));
  const built = fileURLToPath(new URL('./entry.js', import.meta.url));

  return existsSync(source) ? source : built;
}

function browserExecutable(): string | undefined {
  return process.env.REMOTION_BROWSER_EXECUTABLE?.trim() || undefined;
}

let bundlePromise: Promise<string> | null = null;

/** The demo has its own entry point; the production `Scene` bundle is not reused. */
export function getUiDemoBundle(): Promise<string> {
  bundlePromise ??= bundle({
    entryPoint: entryPointPath(),
    publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
    onProgress: () => undefined,
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        extensionAlias: {
          ...config.resolve?.extensionAlias,
          '.js': ['.ts', '.tsx', '.js'],
        },
      },
    }),
  });

  return bundlePromise;
}

export async function renderUiEpisode({
  episode,
  showSafeZones,
  outPath,
  onProgress,
}: RenderUiEpisodeOptions): Promise<RenderUiEpisodeResult> {  const inputProps = uiEpisodeInputPropsSchema.parse({
    episode,
    showSafeZones,
  });
  const serveUrl = await getUiDemoBundle();
  const executable = browserExecutable();
  const startedAt = Date.now();

  const composition = await selectComposition({
    serveUrl,
    id: UI_EPISODE_COMPOSITION_ID,
    inputProps,
    browserExecutable: executable,
    logLevel: 'warn',
  });

  await renderMedia({
    composition,
    serveUrl,
    codec: SCENE_RENDER_MEDIA_OPTIONS.codec,
    outputLocation: outPath,
    inputProps,
    pixelFormat: SCENE_RENDER_MEDIA_OPTIONS.pixelFormat,
    colorSpace: SCENE_RENDER_MEDIA_OPTIONS.colorSpace,
    crf: 18,
    concurrency: 1,
    muted: SCENE_RENDER_MEDIA_OPTIONS.muted,
    overwrite: true,
    browserExecutable: executable,
    /* Software GL: GPU rasterisation is not bit-stable across runs (diffs of a
       few LSB on filtered images), and the pipeline promises identical frames.
       `swangle` still showed ±1 channel drift on rotated/anti-aliased geometry,
       so stills and video both use `swiftshader`. */
    chromiumOptions: { gl: 'swiftshader' },
    logLevel: 'warn',
    onProgress: ({ progress }) => onProgress?.(progress),
  });

  const renderMs = Date.now() - startedAt;
  const file = await stat(outPath);

  return {
    outPath,
    durationInFrames: composition.durationInFrames,
    sizeBytes: file.size,
    renderMs,
  };
}
