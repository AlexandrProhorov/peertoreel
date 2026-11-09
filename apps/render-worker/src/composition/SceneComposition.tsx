import { AbsoluteFill, continueRender, delayRender } from 'remotion';
import { useEffect, useState } from 'react';
import type { FC } from 'react';
import type { StoryboardScene, StoryboardStyle } from '@peertoreel/contracts';
import { KineticTypography } from '../components/KineticTypography.js';
import { ParallaxCity } from '../components/ParallaxCity.js';
import { SceneObjects } from '../components/SceneObjects.js';
import { resolveSceneComponent } from '../mapping.js';
import type { ImplementedComponentId } from '../mapping.js';
import type { SceneInputProps } from '../props.js';

interface SceneBaseProps {
  scene: StoryboardScene;
  style: StoryboardStyle;
}

/** Adding a component to `IMPLEMENTED_COMPONENTS` is a compile error here. */
const COMPONENT_RENDERERS: Record<ImplementedComponentId, FC<SceneBaseProps>> = {
  'parallax-city': ParallaxCity,
  'kinetic-typography': KineticTypography,
};

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

export function SceneComposition({
  scene,
  style,
  wordTimings,
}: SceneInputProps) {
  useLocalFontsReady();
  const choice = resolveSceneComponent(scene);
  const Base = COMPONENT_RENDERERS[choice.componentId];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: style.palette.background[0] ?? '#0b1220',
        overflow: 'hidden',
      }}
    >
      <Base scene={scene} style={style} />
      <SceneObjects scene={scene} style={style} wordTimings={wordTimings} />
    </AbsoluteFill>
  );
}
