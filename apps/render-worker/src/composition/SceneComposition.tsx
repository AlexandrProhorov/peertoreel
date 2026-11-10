import { AbsoluteFill, continueRender, delayRender } from 'remotion';
import { useEffect, useState } from 'react';
import type { StoryboardScene, StoryboardStyle } from '@peertoreel/contracts';
import { KineticTypography } from '../components/KineticTypography.js';
import { ParallaxCity } from '../components/ParallaxCity.js';
import { RecipeLayers } from '../components/RecipeLayers.js';
import { SceneObjects } from '../components/SceneObjects.js';
import type { ResolvedSceneProps } from '../mapping.js';
import type { SceneInputProps } from '../props.js';

const FONT_SPECS = ['900 64px Montserrat', '700 64px Montserrat'];

/**
 * Explicitly load the weights used by text objects. `document.fonts.ready`
 * alone can resolve before the first text frame is in the DOM.
 */
function useLocalFontsReady(): void {
  const [handle] = useState(() => delayRender('Loading local fonts'));

  useEffect(() => {
    let cancelled = false;

    Promise.all(FONT_SPECS.map((spec) => document.fonts.load(spec)))
      .then(() => document.fonts.ready)
      .then(() => {
        if (!cancelled) {
          continueRender(handle);
        }
      })
      .catch(() => {
        if (!cancelled) {
          continueRender(handle);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [handle]);
}

function BaseScene({
  resolved,
  scene,
  style,
}: {
  resolved: ResolvedSceneProps;
  scene: StoryboardScene;
  style: StoryboardStyle;
}) {
  switch (resolved.componentId) {
    case 'parallax-city':
      return (
        <ParallaxCity scene={scene} style={style} params={resolved.params} />
      );
    case 'kinetic-typography':
      return (
        <KineticTypography
          scene={scene}
          style={style}
          params={resolved.params}
        />
      );
  }
}

export function SceneComposition({
  scene,
  style,
  resolved,
  wordTimings,
}: SceneInputProps) {
  useLocalFontsReady();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: style.palette.background[0] ?? '#0b1220',
        overflow: 'hidden',
      }}
    >
      <BaseScene resolved={resolved} scene={scene} style={style} />
      {resolved.recipe === null ? (
        <SceneObjects scene={scene} style={style} wordTimings={wordTimings} />
      ) : (
        <RecipeLayers
          recipe={resolved.recipe}
          scene={scene}
          style={style}
        />
      )}
    </AbsoluteFill>
  );
}
