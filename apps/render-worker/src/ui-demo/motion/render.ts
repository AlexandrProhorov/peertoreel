import { renderMedia, selectComposition } from '@remotion/renderer';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { SCENE_RENDER_MEDIA_OPTIONS } from '../../video-target.js';
import { getUiDemoBundle } from '../render.js';
import {
  UI_MICRO_COMPOSITION_ID,
  UI_MOTION_COMPOSITION_ID,
} from './UiMotion.js';

export interface RenderCompositionOptions {
  compositionId: string;
  inputProps: Record<string, unknown>;
  outPath: string;
  onProgress?: (progress: number) => void;
}

export interface RenderCompositionResult {
  outPath: string;
  durationInFrames: number;
  sizeBytes: number;
  renderMs: number;
}

function browserExecutable(): string | undefined {
  return process.env.REMOTION_BROWSER_EXECUTABLE?.trim() || undefined;
}

/** Renders one motion-lab composition with the same output spec as the video. */
export async function renderComposition({
  compositionId,
  inputProps,
  outPath,
  onProgress,
}: RenderCompositionOptions): Promise<RenderCompositionResult> {
  await mkdir(path.dirname(outPath), { recursive: true });

  const serveUrl = await getUiDemoBundle();
  const executable = browserExecutable();
  const startedAt = Date.now();

  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
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
    chromiumOptions: { gl: 'swangle' },
    logLevel: 'warn',
    onProgress: ({ progress }) => onProgress?.(progress),
  });

  return {
    outPath,
    durationInFrames: composition.durationInFrames,
    sizeBytes: 0,
    renderMs: Date.now() - startedAt,
  };
}

export { UI_MICRO_COMPOSITION_ID, UI_MOTION_COMPOSITION_ID };
