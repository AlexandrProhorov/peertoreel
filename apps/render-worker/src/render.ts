import type { DerivedWord, StoryboardScene, StoryboardStyle } from '@peertoreel/contracts';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCENE_COMPOSITION_ID,
  sceneInputPropsSchema,
  type SceneInputProps,
} from './props.js';

export interface RenderSceneOptions {
  scene: StoryboardScene;
  style: StoryboardStyle;
  wordTimings?: readonly DerivedWord[];
  outPath: string;
  onProgress?: (progress: number) => void;
}

export interface RenderSceneResult {
  outPath: string;
  durationInFrames: number;
  durationSec: number;
  sizeBytes: number;
}

let bundlePromise: Promise<string> | null = null;

function entryPointPath(): string {
  const source = fileURLToPath(
    new URL('./composition/index.tsx', import.meta.url),
  );
  const built = fileURLToPath(
    new URL('./composition/index.js', import.meta.url),
  );

  return existsSync(source) ? source : built;
}

function browserExecutable(): string | undefined {
  return process.env.REMOTION_BROWSER_EXECUTABLE?.trim() || undefined;
}

/** Bundle once and reuse it for every scene in a run. */
export function getSceneBundle(): Promise<string> {
  bundlePromise ??= bundle({
    entryPoint: entryPointPath(),
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

export async function renderScene({
  scene,
  style,
  wordTimings,
  outPath,
  onProgress,
}: RenderSceneOptions): Promise<RenderSceneResult> {
  const inputProps: SceneInputProps = sceneInputPropsSchema.parse({
    scene,
    style,
    wordTimings,
  });
  const serveUrl = await getSceneBundle();
  const executable = browserExecutable();

  const composition = await selectComposition({
    serveUrl,
    id: SCENE_COMPOSITION_ID,
    inputProps,
    browserExecutable: executable,
    logLevel: 'warn',
  });

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: outPath,
    inputProps,
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    crf: 18,
    concurrency: 1,
    muted: true,
    overwrite: true,
    browserExecutable: executable,
    logLevel: 'warn',
    onProgress: ({ progress }) => onProgress?.(progress),
  });

  const file = await stat(outPath);

  return {
    outPath,
    durationInFrames: composition.durationInFrames,
    durationSec: composition.durationInFrames / composition.fps,
    sizeBytes: file.size,
  };
}

export function sceneOutputName(index: number): string {
  return `scene-${index}.mp4`;
}

export function sceneOutputPath(outDir: string, index: number): string {
  return path.join(outDir, sceneOutputName(index));
}
