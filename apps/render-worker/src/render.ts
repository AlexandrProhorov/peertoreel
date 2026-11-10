import type {
  ComponentParamDiagnostic,
  DerivedWord,
  StoryboardScene,
  StoryboardStyle,
} from '@peertoreel/contracts';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveSceneComponent,
  type ImplementedComponentId,
  type SceneComponentSource,
} from './mapping.js';
import {
  SCENE_COMPOSITION_ID,
  sceneInputPropsSchema,
  type SceneInputProps,
} from './props.js';
import { SCENE_RENDER_MEDIA_OPTIONS } from './video-target.js';

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
  componentId: ImplementedComponentId;
  source: SceneComponentSource;
  diagnostics: ComponentParamDiagnostic[];
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

function publicDirPath(): string {
  return fileURLToPath(new URL('../public', import.meta.url));
}

function browserExecutable(): string | undefined {
  return process.env.REMOTION_BROWSER_EXECUTABLE?.trim() || undefined;
}

/** Bundle once and reuse it for every scene in a run. */
export function getSceneBundle(): Promise<string> {
  bundlePromise ??= bundle({
    entryPoint: entryPointPath(),
    publicDir: publicDirPath(),
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
  const resolved = resolveSceneComponent(scene);
  const inputProps: SceneInputProps = sceneInputPropsSchema.parse({
    scene,
    style,
    resolved: {
      componentId: resolved.componentId,
      params: resolved.params,
    },
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
    logLevel: 'warn',
    onProgress: ({ progress }) => onProgress?.(progress),
  });

  const file = await stat(outPath);

  return {
    outPath,
    durationInFrames: composition.durationInFrames,
    durationSec: composition.durationInFrames / composition.fps,
    sizeBytes: file.size,
    componentId: resolved.componentId,
    source: resolved.source,
    diagnostics: resolved.diagnostics,
  };
}

export function sceneOutputName(index: number): string {
  return `scene-${index}.mp4`;
}

export function sceneOutputPath(outDir: string, index: number): string {
  return path.join(outDir, sceneOutputName(index));
}
