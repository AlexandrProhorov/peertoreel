import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SCENE_FPS } from '../../video-target.js';
import { renderUiStill } from '../stills.js';
import { uiSceneFrames, type UiEpisode } from '../spec.js';

/**
 * Does the scene visibly change?
 *
 * A cue list can promise movement that does nothing (`fill` with `fill: 0`,
 * `scale` from 1 to 1). The only honest test is the picture: render two frames
 * far apart and compare the PNG bytes. The renderer is deterministic, so
 * identical bytes mean an identical frame.
 */

export interface MotionCheck {
  readonly changed: boolean;
  readonly earlyFrame: number;
  readonly lateFrame: number;
}

export async function checkVisibleChange(
  episode: UiEpisode,
  outDir: string,
): Promise<MotionCheck> {
  const scene = episode.scenes[0];
  const total = scene === undefined ? 1 : uiSceneFrames(scene, SCENE_FPS);
  /* 35% and 90%: past the entrance, before the last frame. */
  const earlyFrame = Math.max(1, Math.round(total * 0.35));
  const lateFrame = Math.max(earlyFrame + 1, Math.round(total * 0.9));
  const earlyPath = path.join(outDir, 'motion-early.png');
  const latePath = path.join(outDir, 'motion-late.png');

  await renderUiStill({ episode, showSafeZones: false, frame: earlyFrame, outPath: earlyPath });
  await renderUiStill({ episode, showSafeZones: false, frame: lateFrame, outPath: latePath });

  const [early, late] = await Promise.all([readFile(earlyPath), readFile(latePath)]);

  return { changed: !early.equals(late), earlyFrame, lateFrame };
}
