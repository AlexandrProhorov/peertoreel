import { renderStill, selectComposition } from '@remotion/renderer';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getUiDemoBundle } from './render.js';
import {
  UI_EPISODE_COMPOSITION_ID,
  uiEpisodeInputPropsSchema,
  type UiEpisode,
} from './spec.js';

export interface RenderStillOptions {
  episode: UiEpisode;
  showSafeZones: boolean;
  frame: number;
  outPath: string;
}

/**
 * One PNG frame of the episode composition. Used for parity and determinism
 * checks: PNG bytes compare exactly, while an mp4 can diverge in the encoder.
 */
export async function renderUiStill({
  episode,
  showSafeZones,
  frame,
  outPath,
}: RenderStillOptions): Promise<void> {
  const inputProps = uiEpisodeInputPropsSchema.parse({ episode, showSafeZones });
  const serveUrl = await getUiDemoBundle();
  const executable =
    process.env.REMOTION_BROWSER_EXECUTABLE?.trim() || undefined;

  await mkdir(path.dirname(outPath), { recursive: true });

  const composition = await selectComposition({
    serveUrl,
    id: UI_EPISODE_COMPOSITION_ID,
    inputProps,
    browserExecutable: executable,
    logLevel: 'warn',
  });

  await renderStill({
    composition,
    serveUrl,
    output: outPath,
    frame,
    inputProps,
    imageFormat: 'png',
    browserExecutable: executable,
    chromiumOptions: { gl: 'swiftshader' },
    overwrite: true,
    logLevel: 'warn',
  });
}
